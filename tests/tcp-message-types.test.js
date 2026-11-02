import { describe, expect, it } from 'vitest';
import {
  isTcpForwardToRenderer,
  isTcpOutboundAllowed,
  TCP_FORWARD_TO_RENDERER,
} from '../shared/tcp-message-types.js';

describe('tcp-message-types', () => {
  it('forwards pin/edit and project types to the renderer', () => {
    for (const type of [
      'message-pin',
      'message-edit',
      'mesh-proj-pad',
      'mesh-proj-clipboard-pull',
      'group-proj-board',
      'group-proj-clipboard-pull',
    ]) {
      expect(isTcpForwardToRenderer(type)).toBe(true);
    }
  });

  it('keeps call signalling outbound-allowed without renderer forward for offer', () => {
    expect(isTcpOutboundAllowed('call-offer')).toBe(true);
    expect(isTcpForwardToRenderer('call-offer')).toBe(false);
  });

  it('rejects unknown types', () => {
    expect(isTcpForwardToRenderer('evil-payload')).toBe(false);
    expect(isTcpOutboundAllowed('evil-payload')).toBe(false);
    expect(TCP_FORWARD_TO_RENDERER.has('message')).toBe(true);
  });
});
