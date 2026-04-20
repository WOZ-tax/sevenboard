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
}
