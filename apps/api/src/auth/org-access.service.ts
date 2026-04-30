import { Injectable } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { UserLike } from './staff.helpers';

@Injectable()
export class OrgAccessService {
  constructor(private authorization: AuthorizationService) {}

  async assertOrgAccess(user: UserLike, orgId: string): Promise<void> {
    await this.authorization.assertOrgPermission(
      user,
      orgId,
      'org:organizations:read',
    );
  }

  async getAccessibleOrgIds(user: UserLike): Promise<string[]> {
    const orgs = await this.authorization.findAccessibleOrganizations(user);
    return orgs.map((org) => org.id);
  }
}
