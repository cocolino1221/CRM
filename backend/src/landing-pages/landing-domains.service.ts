import { randomBytes } from 'crypto';
import { Resolver } from 'dns/promises';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LandingDomain,
  LandingDomainStatus,
} from '../database/entities/landing-domain.entity';
import { assertHostnameAllowed, normalizeHostname } from './domain-host';

/** The DNS surface this service needs, so tests do not touch the network. */
export interface DnsResolver {
  resolveTxt(hostname: string): Promise<string[][]>;
  resolveCname?(hostname: string): Promise<string[]>;
}

export const DNS_RESOLVER = 'LANDING_DNS_RESOLVER';

/** Where the customer puts the proof that they own the domain. */
const VERIFY_PREFIX = '_etcrm-verify';

@Injectable()
export class LandingDomainsService {
  private readonly logger = new Logger(LandingDomainsService.name);

  constructor(
    @InjectRepository(LandingDomain)
    private readonly domainRepository: Repository<LandingDomain>,
    @Inject(DNS_RESOLVER)
    private readonly dns: DnsResolver,
  ) {}

  async list(workspaceId: string): Promise<LandingDomain[]> {
    // TypeORM excludes soft-deleted rows unless asked for them.
    return this.domainRepository.find({ where: { workspaceId } });
  }

  /**
   * Claim a hostname for this workspace.
   *
   * Nothing is served from it until the TXT record proves ownership — until
   * then, the person who typed it may simply not own it.
   */
  async addDomain(workspaceId: string, input: string): Promise<LandingDomain> {
    const hostname = assertHostnameAllowed(input);

    // Only a *verified* domain blocks anyone else. Blocking on an unverified
    // claim would let a workspace hold a competitor's hostname hostage simply
    // by typing it and never proving ownership. Several workspaces may have a
    // pending claim on the same hostname; only the one that can publish the
    // token into DNS will ever own it.
    const owned = await this.domainRepository.findOne({
      where: { hostname, status: LandingDomainStatus.ACTIVE },
    });
    if (owned) {
      throw new ConflictException(
        owned.workspaceId === workspaceId
          ? 'Domeniul este deja adăugat'
          : 'Domeniul este deja folosit de alt cont',
      );
    }

    const mine = await this.domainRepository.findOne({ where: { hostname, workspaceId } });
    if (mine) {
      throw new ConflictException('Domeniul este deja adăugat');
    }

    const existing = await this.list(workspaceId);

    const domain = this.domainRepository.create({
      workspaceId,
      hostname,
      status: LandingDomainStatus.PENDING,
      verificationToken: `etcrm-verify=${randomBytes(16).toString('hex')}`,
      // The first domain a workspace adds is the one its links are built from.
      isPrimary: existing.length === 0,
    });

    return this.domainRepository.save(domain);
  }

  /** What the customer has to put in their DNS, ready to copy. */
  instructionsFor(domain: LandingDomain): {
    verification: { type: string; name: string; value: string };
    pointing: { type: string; name: string; value: string };
  } {
    return {
      verification: {
        type: 'TXT',
        name: `${VERIFY_PREFIX}.${domain.hostname}`,
        value: domain.verificationToken,
      },
      pointing: {
        type: 'CNAME',
        name: domain.hostname,
        value: 'etcrm.primafisoft.com',
      },
    };
  }

  /**
   * Check the TXT record and activate the domain if it matches.
   *
   * A missing record is the normal case while DNS propagates, so it is a
   * recorded failure with a readable reason rather than an exception.
   */
  async verify(workspaceId: string, id: string): Promise<LandingDomain> {
    const domain = await this.domainRepository.findOne({ where: { id, workspaceId } });
    if (!domain) throw new NotFoundException('Domeniul nu a fost găsit');

    const name = `${VERIFY_PREFIX}.${domain.hostname}`;
    domain.lastCheckedAt = new Date();

    let records: string[][];
    try {
      records = await this.dns.resolveTxt(name);
    } catch (error: any) {
      domain.status = LandingDomainStatus.FAILED;
      domain.lastError = `Nu am găsit înregistrarea TXT pe ${name} (${error?.code || error?.message || 'eroare DNS'}). Dacă tocmai ai adăugat-o, propagarea poate dura până la o oră.`;
      return this.domainRepository.save(domain);
    }

    // DNS hands back each value as an array of chunks, because a long string
    // is split at 255 characters.
    const values = (records || []).map((chunks) => (Array.isArray(chunks) ? chunks.join('') : String(chunks)));

    if (!values.includes(domain.verificationToken)) {
      domain.status = LandingDomainStatus.FAILED;
      domain.lastError = values.length
        ? `Am găsit înregistrări TXT pe ${name}, dar niciuna nu conține codul tău.`
        : `Nu există nicio înregistrare TXT pe ${name}.`;
      return this.domainRepository.save(domain);
    }

    domain.status = LandingDomainStatus.ACTIVE;
    domain.verifiedAt = new Date();
    domain.lastError = null;
    const saved = await this.domainRepository.save(domain);

    // The hostname is settled now. Any rival claim on it belonged to someone
    // who could not prove ownership, and leaving it would both clutter their
    // screen and collide with the unique index.
    const rivals = await this.domainRepository.find({ where: { hostname: domain.hostname } });
    for (const rival of rivals) {
      if (rival.id === domain.id) continue;
      await this.domainRepository.softRemove(rival);
    }

    this.logger.log(`Domain verified: ${domain.hostname} (workspace ${workspaceId})`);
    return saved;
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const domain = await this.domainRepository.findOne({ where: { id, workspaceId } });
    if (!domain) throw new NotFoundException('Domeniul nu a fost găsit');
    await this.domainRepository.softRemove(domain);
  }

  /**
   * Which workspace a public request belongs to, by its Host header.
   *
   * Only verified domains resolve. Returns null rather than throwing: an
   * unknown host is an ordinary visitor on the wrong address, not an error.
   */
  async resolveWorkspaceByHost(host: string | undefined | null): Promise<string | null> {
    const hostname = normalizeHostname(host);
    if (!hostname) return null;

    const domain = await this.domainRepository.findOne({
      where: { hostname, status: LandingDomainStatus.ACTIVE },
    });
    return domain?.workspaceId ?? null;
  }
}
