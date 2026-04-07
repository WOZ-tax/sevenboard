import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, userRole: string, userOrgId: string | null) {
    // ADVISORs can see all assigned orgs; others see their own org
    if (userRole === 'ADVISOR') {
      const assignments = await this.prisma.advisorAssignment.findMany({
        where: { userId },
        include: { organization: true },
      });
      return assignments.map((a) => a.organization);
    }

    if (!userOrgId) {
      return [];
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: userOrgId },
    });
    return org ? [org] : [];
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        departments: { orderBy: { displayOrder: 'asc' } },
        accounts: { orderBy: { displayOrder: 'asc' } },
      },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return org;
  }
}
