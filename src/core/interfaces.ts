


export interface Tunnel {
    forward (request : Request): Promise<Response>;
}


export interface TunnelStore {

    get (name: string): Promise<Tunnel | null>;
    
    // Keep the original incoming request so the WebSocket upgrade handshake stays intact.
    register (name: string, request: Request): Promise<Response>;

    isAvailable (name: string): Promise<boolean>;

    remove (name: string): Promise<void>;

}