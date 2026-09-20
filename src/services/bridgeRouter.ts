import { Router } from 'express';
import { isLoopbackAddress, parseBridgeRequest } from './bridgePolicy.ts';
import { safeEqualText } from './security.ts';
import type { DeviceControlResult } from './DeviceControlService.ts';

type Dependencies = {
  env: NodeJS.ProcessEnv;
  state: () => Promise<unknown>;
  nodes: () => Promise<Array<{ id: string }>>;
  control: (id: string, state: 'on' | 'off') => Promise<DeviceControlResult>;
};

/** Compatibility transport only. UJO's control service retains final physical authority. */
export function createBridgeRouter(deps: Dependencies) {
  const router = Router();
  router.post('/api/v1/execute', async (req, res) => {
    const token = deps.env.UJO_BRIDGE_TOKEN;
    const bearer = req.headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1] ?? '';
    const authorized = token ? safeEqualText(bearer, token)
      : deps.env.NODE_ENV !== 'production' && isLoopbackAddress(req.socket.remoteAddress);
    if (!authorized) return res.status(401).json({ status: 'error', error: 'Bridge authentication required.' });
    const request = parseBridgeRequest(req.body);
    if (!request) return res.status(400).json({ status: 'error', error: 'Invalid bridge request.' });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-UJO-Protocol-Version', '1.0');
    try {
      if (request.action === 'status' || request.action === 'get_state') {
        const state = await deps.state();
        return res.json({ status: 'success', output: request.action === 'status' ? 'Ujo hub online' : state, state });
      }
      if (request.action === 'list_nodes') {
        const nodes = await deps.nodes();
        return res.json({ status: 'success', nodes: nodes.map(node => node.id), source: 'hub_registry', verified: false });
      }
      if (request.action === 'device_control') {
        const result = await deps.control(request.parameters.id, request.parameters.state);
        return res.status(result.status === 'COMPLETED' ? 200 : 202).json({ status: 'success', output: result.message, result });
      }
    } catch {
      // Never include driver errors, credentials, request bodies or device internals.
      return res.status(409).json({ status: 'error', error: 'UJO could not authorize or complete this request.' });
    }
  });
  return router;
}
