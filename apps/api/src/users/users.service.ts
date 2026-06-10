import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  LEADER_ROLES,
  TIER_LABELS,
  type MembershipCard,
  type Role,
  type UpdateProfileDto,
  type UserPublic,
} from "@pw/shared";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../providers/storage.provider";
import { newId } from "../auth/crypto.util";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  isLeader(role: Role): boolean {
    return LEADER_ROLES.includes(role);
  }

  async toPublic(userId: string): Promise<UserPublic> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { orgUnit: true },
    });
    if (!u) throw new NotFoundException("User not found");

    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      photoUrl: u.photoUrl,
      designation: u.designation,
      role: u.role as Role,
      tier: u.tier,
      orgUnitId: u.orgUnitId,
      orgUnitName: u.orgUnit.name,
      boothName: u.orgUnit.type === "booth" ? u.orgUnit.name : null,
      preferredLanguage: u.preferredLanguage,
      lifetimeReputation: u.lifetimeReputation,
      weeklyLeaguePoints: u.weeklyLeaguePoints,
      membershipActive: u.membershipActive,
      isLeader: this.isLeader(u.role as Role),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserPublic> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        // designation is admin/leader-controlled — not part of self-service edits
        ...(dto.preferredLanguage !== undefined
          ? { preferredLanguage: dto.preferredLanguage }
          : {}),
        ...(dto.photoKey !== undefined ? { photoUrl: this.storage.publicUrl(dto.photoKey) } : {}),
      },
    });
    return this.toPublic(userId);
  }

  /** Accepts a data URL (data:image/png;base64,...) — works for web + native. */
  async setPhotoFromDataUrl(userId: string, dataUrl: string): Promise<UserPublic> {
    const match = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) throw new NotFoundException("Invalid image data URL");
    const contentType = match[1]!;
    const ext = contentType.split("/")[1] ?? "png";
    const buffer = Buffer.from(match[2]!, "base64");
    const key = `profile/${userId}/${newId()}.${ext}`;
    const { url } = await this.storage.put(key, buffer, contentType);
    await this.prisma.user.update({ where: { id: userId }, data: { photoUrl: url } });
    return this.toPublic(userId);
  }

  async getMembershipCard(userId: string): Promise<MembershipCard> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { orgUnit: true },
    });
    if (!u) throw new NotFoundException("User not found");
    return {
      userId: u.id,
      name: u.name,
      photoUrl: u.photoUrl,
      designation: u.designation,
      boothName: u.orgUnit.type === "booth" ? u.orgUnit.name : u.orgUnit.name,
      tier: u.tier,
      tierLabel: TIER_LABELS[u.tier],
      qrPayload: `pw:member:${u.id}`,
      membershipActive: u.membershipActive,
    };
  }
}
