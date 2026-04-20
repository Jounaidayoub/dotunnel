import { Tunnel, TunnelStore } from '../core/interfaces';
import { doTunnel } from './dotunnel';



export class CloudflareTunnelStore implements TunnelStore {
    constructor(
        private doNamespace: DurableObjectNamespace<doTunnel>,
        private kv: KVNamespace
    ) { }

    async get(name: string): Promise<Tunnel | null> {
        const registered = await this.kv.get(name);
        if (!registered) return null;
        return this.doNamespace.getByName(name);
    }
    // Forwarding the original request preserves the external WebSocket upgrade handshake.
    async register(name: string, request: Request): Promise<Response> {
        await this.kv.put(name, 'registered');
        const stub = this.doNamespace.getByName(name);
        return stub.fetch(request);
    }

    async isAvailable(name: string): Promise<boolean> {
        const value = await this.kv.get(name);
        return value === null;
    }

    async remove(name: string): Promise<void> {
        await this.kv.delete(name);
    }
}