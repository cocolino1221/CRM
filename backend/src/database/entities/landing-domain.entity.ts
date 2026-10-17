import { Column, Entity, Index } from 'typeorm';
import { WorkspaceEntity } from './base.entity';

export enum LandingDomainStatus {
  /** Added, waiting for the customer's DNS to point here. */
  PENDING = 'pending',
  /** DNS resolves to us and the certificate is in place. */
  ACTIVE = 'active',
  /** Checked and found wrong — the message is in lastError. */
  FAILED = 'failed',
}

/**
 * A hostname a workspace serves its landing pages on.
 *
 * Separate from `workspaces.domain`, which despite the name holds an internal
 * tenant identifier ("test-1768896580928"), not a web address. A workspace may
 * also have several: an apex for the brand and a subdomain per campaign.
 */
@Entity('landing_domains')
@Index('IDX_landing_domains_workspace', ['workspaceId'])
export class LandingDomain extends WorkspaceEntity {
  /**
   * Always stored normalized — lowercase, no protocol, port or trailing dot.
   *
   * Unique only among *verified* rows (a partial index, see the
   * LandingDomainPartialUnique migration): several workspaces may claim the
   * same hostname, but only the one that can publish the token into DNS owns
   * it. A table-wide unique would let anyone hold a competitor's domain by
   * typing it and never proving anything.
   */
  @Column({ type: 'varchar', length: 253 })
  @Index('IDX_landing_domains_hostname')
  hostname: string;

  @Column({
    type: 'enum',
    enum: LandingDomainStatus,
    default: LandingDomainStatus.PENDING,
  })
  status: LandingDomainStatus;

  /**
   * Proves the person adding the domain controls it, as a TXT record. Without
   * this, anyone could claim a competitor's hostname and hold it.
   */
  @Column({ type: 'varchar', length: 100 })
  verificationToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastCheckedAt?: Date | null;

  /** Why the last check failed, in words the customer can act on. */
  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  /** The host used when building absolute links for this workspace. */
  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;
}
