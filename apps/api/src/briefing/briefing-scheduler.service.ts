import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BriefingService } from './briefing.service';
import { postBriefingToSlack } from './slack-notifier';

@Injectable()
export class BriefingSchedulerService {
  private readonly logger = new Logger('BriefingScheduler');

  /**
   * 冪等化用の送信済みマーカー。key = `${orgId}:${YYYYMMDDHH(JST)}` → 配信時刻(ms)。
   * 同一プロセス内で同一org×同一JST時間枠への二重配信を抑止する。
   *
   * NOTE: これはあくまでプロセス内ガード。Cloud Run の複数インスタンスが同時に
   *       @Cron 発火した場合の重複配信は、インメモリのみでは完全には防げない。
   *       本質的な対策は Cloud Scheduler → 単一HTTPエンドポイント化 +
   *       永続的な送信済みフラグ(例: Organization の last-pushed 列 / 配信ログ行の
   *       一意制約による排他)であり、これはインフラ/スキーマ変更を伴うため本WS範囲外。
   */
  private readonly lastDispatchedKey = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private briefing: BriefingService,
    private http: HttpService,
    private notifications: NotificationsService,
  ) {}

  /**
   * JST基準の毎正時に走り、push時刻が一致するOrgにサマリーを配信する。
   * (Nest @nestjs/schedule の Cron はプロセスのローカルタイムゾーン依存。
   *  運用はJST前提だが、UTC環境下でも動くよう毎正時に走って時刻比較で絞る。)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async dispatchHourly(): Promise<void> {
    const nowJstHour = this.currentJstHour();
    // org×時間枠の粒度キー(JSTの YYYYMMDDHH)。同一枠の二重配信判定に使う。
    const windowKey = this.currentJstWindowKey();
    this.pruneDispatchMarkers();

    const orgs = await this.prisma.organization.findMany({
      where: {
        briefPushEnabled: true,
        briefPushHourJst: nowJstHour,
        briefSlackWebhookUrl: { not: null },
      },
      select: {
        id: true,
        name: true,
        briefSlackWebhookUrl: true,
      },
    });

    if (orgs.length === 0) return;

    this.logger.log(
      `Dispatching briefing push to ${orgs.length} org(s) at JST ${nowJstHour}:00`,
    );

    for (const org of orgs) {
      // 冪等化ガード: 同一org×同一JST時間枠で既に配信済みならスキップ。
      // (Slack送信より前に判定し、同一プロセス内の二重配信を防ぐ)
      const dedupeKey = `${org.id}:${windowKey}`;
      if (this.lastDispatchedKey.has(dedupeKey)) {
        this.logger.warn(
          `Skipping duplicate briefing for ${org.id} in window ${windowKey} (already dispatched this hour)`,
        );
        continue;
      }
      // Slack送信の前にマーカーを立てて二重発火を防ぐ。送信失敗時はマーカーを
      // 外し、次回(同一時間枠の再発火)でのリトライを許容する。
      this.lastDispatchedKey.set(dedupeKey, Date.now());

      try {
        const response = await this.briefing.today(org.id);
        if (!org.briefSlackWebhookUrl) continue;
        await postBriefingToSlack(
          this.http,
          org.briefSlackWebhookUrl,
          org.name,
          response,
        );
        this.logger.log(`Briefing pushed to ${org.name} (${org.id})`);
        await this.notifications
          .create({
            orgId: org.id,
            userId: null,
            type: 'SYSTEM',
            title: '今朝のサマリーを配信しました',
            message: `${response.headlines.length}件の注目点をSlackに送信しました。`,
            metadata: {
              linkHref: '/',
              kind: 'briefing-pushed',
              headlineCount: response.headlines.length,
            },
          })
          .catch((err) =>
            this.logger.warn(
              `Briefing notification write failed: ${err instanceof Error ? err.message : err}`,
            ),
          );
      } catch (err) {
        // 配信失敗時はマーカーを外し、同一時間枠の再発火でリトライ可能にする。
        this.lastDispatchedKey.delete(dedupeKey);
        this.logger.error(
          `Briefing push failed for ${org.id}: ${err instanceof Error ? err.message : err}`,
        );
        await this.notifications
          .create({
            orgId: org.id,
            userId: null,
            type: 'SYSTEM',
            title: '朝サマリーの配信に失敗しました',
            message: err instanceof Error ? err.message : String(err),
            metadata: { linkHref: '/settings', kind: 'briefing-failed' },
          })
          .catch(() => undefined);
      }
    }
  }

  /**
   * 手動トリガ用: 指定orgに即時配信する（管理UIからのテスト送信）。
   */
  async dispatchNow(orgId: string): Promise<{ sent: boolean; reason?: string }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, briefSlackWebhookUrl: true },
    });
    if (!org) return { sent: false, reason: 'organization not found' };
    if (!org.briefSlackWebhookUrl) {
      return { sent: false, reason: 'Slack webhook URL not configured' };
    }
    const response = await this.briefing.today(orgId);
    await postBriefingToSlack(
      this.http,
      org.briefSlackWebhookUrl,
      org.name,
      response,
    );
    return { sent: true };
  }

  private currentJstHour(): number {
    const now = new Date();
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const jstMinutes = (utcMinutes + 9 * 60) % (24 * 60);
    return Math.floor(jstMinutes / 60);
  }

  /**
   * 冪等化キーのJST時間枠部分(YYYYMMDDHH)を返す。日付込みなので
   * 翌日同時刻と衝突せず、過去枠のマーカーは prune で自然に掃除できる。
   */
  private currentJstWindowKey(): string {
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const y = jst.getUTCFullYear();
    const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(jst.getUTCDate()).padStart(2, '0');
    const h = String(jst.getUTCHours()).padStart(2, '0');
    return `${y}${m}${d}${h}`;
  }

  /**
   * 古い送信済みマーカーを掃除する(無制限なメモリ増加を防ぐ)。
   * 直近2時間ぶんだけ保持すれば二重発火検知には十分。
   */
  private pruneDispatchMarkers(): void {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [key, ts] of this.lastDispatchedKey) {
      if (ts < cutoff) this.lastDispatchedKey.delete(key);
    }
  }
}
