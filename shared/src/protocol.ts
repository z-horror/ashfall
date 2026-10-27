import { z } from 'zod';
import { MAX_CHAT_LEN } from './constants.js';

const seq = z.number().int().min(0).max(2_000_000_000);
const unit = z.number().min(-1).max(1);
const angle = z.number().min(-10).max(10);
const id = z.string().min(1).max(80);

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('auth'), token: z.string().min(16).max(256), v: z.number().int().optional() }),
  z.object({ t: z.literal('input'), seq, mx: unit, my: unit, aim: angle, sprint: z.boolean() }),
  z.object({ t: z.literal('attack'), seq, aim: angle.optional() }),
  z.object({ t: z.literal('interact'), seq }),
  z.object({ t: z.literal('use_stairs'), seq, id }),
  z.object({ t: z.literal('open_container'), seq, id }),
  z.object({ t: z.literal('close_container'), seq }),
  z.object({ t: z.literal('pickup'), seq, id }),
  z.object({ t: z.literal('drop'), seq, id, qty: z.number().int().min(1).max(999) }),
  z.object({
    t: z.literal('transfer'),
    seq,
    id,
    qty: z.number().int().min(1).max(999),
    dir: z.enum(['take', 'put']),
  }),
  z.object({ t: z.literal('use'), seq, id }),
  z.object({ t: z.literal('equip'), seq, id }),
  z.object({ t: z.literal('craft'), seq, recipeId: id }),
  z.object({ t: z.literal('dev_action'), seq, action: z.string().min(1).max(32), args: z.record(z.string(), z.any()).optional() }),
  z.object({ t: z.literal('respawn'), seq }),
  z.object({ t: z.literal('chat'), text: z.string().min(1).max(MAX_CHAT_LEN) }),
  z.object({ t: z.literal('ping'), ts: z.number().finite() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['t'];

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const parsed = clientMessageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
