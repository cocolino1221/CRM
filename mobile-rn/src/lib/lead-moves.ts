/**
 * Moving a lead along, from the lead's own screen.
 *
 * What each move has to write is the whole question here. "Programat" is the
 * one that matters: the badge on a row comes from a real booking, so a move
 * that only recorded an outcome would leave the row exactly as it was — the
 * caller would tick it and watch nothing happen. It books an appointment.
 *
 * Everything else goes through the disposition endpoint, which already
 * writes the outcome, the note, the deal and the follow-up task in one
 * transaction and is idempotent on the request id.
 */

export type LeadMoveId = 'scheduled' | 'won' | 'lost' | 'callback' | 'note';

export interface LeadMove {
  id: LeadMoveId;
  /** Romanian: this is what the button says. */
  label: string;
  hint: string;
  /** What the screen must collect before this move can be saved. */
  needs?: 'datetime' | 'amount';
  color: string;
}

export const LEAD_MOVES: LeadMove[] = [
  {
    id: 'scheduled',
    label: 'Programat',
    hint: 'Creează programarea și mută leadul la Programat.',
    needs: 'datetime',
    color: '#059669',
  },
  {
    id: 'won',
    label: 'Vândut',
    hint: 'Închide vânzarea cu suma încasată.',
    needs: 'amount',
    color: '#4f46e5',
  },
  { id: 'lost', label: 'Pierdut', hint: 'Nu mai e de urmărit.', color: '#dc2626' },
  {
    id: 'callback',
    label: 'Revenire',
    hint: 'Îți pune memento la data aleasă.',
    needs: 'datetime',
    color: '#d97706',
  },
  { id: 'note', label: 'Doar notiță', hint: 'Fără să schimbi starea.', color: '#64748b' },
];

export function moveById(id: string): LeadMove | undefined {
  return LEAD_MOVES.find((m) => m.id === id);
}

export interface MoveInput {
  move: LeadMoveId;
  contact: { id: string; firstName?: string; lastName?: string; phone?: string; email?: string };
  notes?: string;
  amount?: string;
  /** ISO, for a booking or a follow-up. */
  at?: string;
  hostId?: string;
  clientRequestId: string;
}

export interface MovePayloads {
  disposition: Record<string, any>;
  booking: Record<string, any> | null;
  /** A sentence to show instead of saving. */
  error?: string;
}

const DEFAULT_BOOKING_MINUTES = 30;

function contactName(contact: MoveInput['contact']): string {
  return (
    `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() ||
    contact.phone ||
    contact.email ||
    'Contact'
  );
}

/** A Romanian keyboard gives a decimal comma. */
function parseAmount(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const value = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function buildMovePayloads(input: MoveInput): MovePayloads {
  const notes = input.notes?.trim();
  const disposition: Record<string, any> = {
    contactId: input.contact.id,
    clientRequestId: input.clientRequestId,
  };
  if (notes) disposition.notes = notes;

  switch (input.move) {
    case 'scheduled': {
      disposition.outcome = 'scheduled';
      if (!input.at) {
        return { disposition, booking: null, error: 'Alege data și ora programării.' };
      }
      if (!input.hostId) {
        return {
          disposition,
          booking: null,
          error: 'Alege cine ține întâlnirea.',
        };
      }
      return {
        disposition,
        booking: {
          hostId: input.hostId,
          contactId: input.contact.id,
          startTime: input.at,
          duration: DEFAULT_BOOKING_MINUTES,
          notes: notes || undefined,
        },
      };
    }

    case 'won': {
      disposition.outcome = 'successful';
      const value = parseAmount(input.amount);
      if (value === null) {
        return {
          disposition,
          booking: null,
          error: 'Pune suma încasată — altfel se înregistrează o vânzare de zero.',
        };
      }
      disposition.deal = { value, currency: 'RON' };
      return { disposition, booking: null };
    }

    case 'lost':
      disposition.outcome = 'failed';
      return { disposition, booking: null };

    case 'callback': {
      disposition.outcome = 'no_answer';
      if (!input.at) {
        return { disposition, booking: null, error: 'Alege când revii.' };
      }
      disposition.followUp = { at: input.at, title: `Revenire — ${contactName(input.contact)}` };
      return { disposition, booking: null };
    }

    case 'note':
    default:
      // The one move that changes no state, so it must at least carry text.
      if (!notes) {
        return { disposition, booking: null, error: 'Scrie notița.' };
      }
      disposition.outcome = 'successful';
      return { disposition, booking: null };
  }
}
