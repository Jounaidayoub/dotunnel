import { DurableObject } from 'cloudflare:workers';
import { Tunnel } from "../core/interfaces";
import {
	decodeTunnelResponse,
	encodeTunnelRequest,
	TunnelRequestPayload,
	TunnelResponsePayload,
} from "../core/protocol";

type PendingRequests = {
	resolve: (response: Response) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
};

export class doTunnel extends DurableObject<Env> implements Tunnel {
	proxyclient: WebSocket | null = null;
	proxyName: string = '';

	pendingRequests: Map<string, PendingRequests> = new Map();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.pendingRequests = new Map();

		if (this.ctx.getWebSockets().length === 1) {
			console.log('there is one active websocket connection and always it should be');
			this.proxyclient = this.ctx.getWebSockets()[0];
		} else {
			console.log('there is no active websocket connection or more than one : lenght = ', this.ctx.getWebSockets().length);
		}

		this.ctx.storage.get<string>('proxyName').then((name) => {
			if (name) {
				this.proxyName = name;
			}
		});

		this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	async fetch(request: Request): Promise<Response> {
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		this.ctx.acceptWebSocket(server);

		const url = new URL(request.url);
		const proxy = url.pathname.split('/')[2];

		if (proxy) {
			this.proxyName = proxy;
			this.ctx.storage.put('proxyName', this.proxyName);
		}

		this.proxyclient = server;

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async forward(request: Request): Promise<Response> {
		const targetWebSocket = this.proxyclient;
		if (!targetWebSocket) {
			return new Response('Proxy client not connected', {
				status: 503,
			});
		}

		console.log(`number of pending requests: ${this.pendingRequests.size}`);

		const requestBody = await request.text();
		const requestData: TunnelRequestPayload = {
			id: crypto.randomUUID(),
			path: new URL(request.url).pathname,
			method: request.method,
			body: requestBody || undefined,
			headers: Object.fromEntries(request.headers.entries()),
		};

		const requestTimeout = parseInt(this.env.request_timeout) || 10000;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				console.log(` Request ${requestData.id} timed out after ${requestTimeout} milliseconds`);
				resolve(new Response('Request timeout - no response from WebSocket client', { status: 504 })); // 504 Gateway Timeout
				this.pendingRequests.delete(requestData.id);
			}, requestTimeout);

			this.pendingRequests.set(requestData.id, { resolve, reject, timeout });

			try {
				targetWebSocket.send(encodeTunnelRequest(requestData));
			} catch (error) {
				clearTimeout(timeout);
				this.pendingRequests.delete(requestData.id);
				reject(new Error('Failed to send request to WebSocket client'));
			}
		});
	}

	private base64ToArrayBuffer(base64: string): ArrayBuffer {
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes.buffer;
	}

	async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
		try {
			const response = decodeTunnelResponse(message);
			if (!response) {
				return;
			}

			const pendingRequest = this.pendingRequests.get(response.id);
			if (!pendingRequest) {
				return;
			}
			this.pendingRequests.delete(response.id);
			clearTimeout(pendingRequest.timeout);

			const body = this.resolveResponseBody(response);
			const httpResponse = new Response(body, {
				status: response.status || 200,
				headers: response.headers || { 'Content-Type': 'application/json' },
			});

			pendingRequest.resolve(httpResponse);
		} catch (error) {
			ws.send(
				JSON.stringify({
					error: 'Failed to process message',
					details: error instanceof Error ? error.message : 'Unknown error',
				})
			);
		}
	}

	private resolveResponseBody(response: TunnelResponsePayload): BodyInit | null {
		if (!response.body) {
			return null;
		}
		if (response.isBinary) {
			return this.base64ToArrayBuffer(response.body);
		}
		return response.body;
	}

	private async cleanupSocket(reason: string) {
		const pending = Array.from(this.pendingRequests.values());
		this.pendingRequests.clear();
		for (const pendingRequest of pending) {
			clearTimeout(pendingRequest.timeout);
			pendingRequest.reject(new Error(reason));
		}

		if (this.proxyName) {
			try {
				await this.ctx.storage.delete(this.proxyName);
				await this.env.REGISTRED_PROXIES.delete(this.proxyName);
			} catch (error) {
				console.error('Error deleting proxyName from storage:', error);
			}
		}
		this.proxyclient = null;
		this.proxyName = '';
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		await this.cleanupSocket('WebSocket connection closed');
		ws.close(code, 'Durable Object is closing WebSocket');
		console.log('WebSocket closed:', { code, reason, wasClean });
	}
	async webSocketError(ws: WebSocket, error: Error) {
		await this.cleanupSocket('WebSocket connection closed');
		console.error('WebSocket error:', error);
	}
}
