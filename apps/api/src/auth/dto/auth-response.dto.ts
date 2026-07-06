export class AuthResponseDto {
  accessToken: string;
  /** クロスオリジン構成で document.cookie から sb_csrf を読めないクライアント向けに body でも配布 */
  csrfToken?: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    orgId: string | null;
  };
}
