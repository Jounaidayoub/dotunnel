import { DurableObject } from 'cloudflare:workers';

export class MyDurableObject extends DurableObject<Env> {
	// sessions: Map<WebSocket, { [key: string]: string }>;
	proxyclient: WebSocket | null = null;
	proxyName: string = '';

	// Keeps track of pending HTTP requests waiting for WebSocket responses
	pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: number }>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// this.sessions = new Map();
		this.pendingRequests = new Map();

	

		if (this.ctx.getWebSockets().length === 1) {
			console.log('there is one active websocket connection and always it should be');
			this.proxyclient = this.ctx.getWebSockets()[0];
		}
		else {
			console.log('there is no active websocket connection or more than one : lenght = ',
				this.ctx.getWebSockets().length
			);
		}

		this.ctx.storage.get<string>('proxyName').then((name) => {
			if (name) {
				this.proxyName = name;
			}
		});

		// Sets an application level auto response that does not wake hibernated WebSockets.
		this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	async fetch(request: Request): Promise<Response> {
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		this.ctx.acceptWebSocket(server);

		const id = crypto.randomUUID();

		const url = new URL(request.url);
		const proxy = url.pathname.split('/')[2];

		if (proxy) {
			this.proxyName = proxy;
			this.ctx.storage.put('proxyName', this.proxyName);
		}

		

		// Add the WebSocket connection to the map of active sessions.
		
		this.proxyclient = server;

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async processRequest(request: Request, proxy: string): Promise<Response> {
		console.log(`number of pending requests: ${this.pendingRequests.size}`);
		// Get request data
		const requestBody = await request.text();

		const requestData = {
			id: crypto.randomUUID(),
			path: new URL(request.url).pathname.replace(new RegExp(`^/serve/${proxy}`), ''), // Remove leading /serve/{proxy} prefix
			method: request.method,
			body: requestBody || undefined,
			headers: Object.fromEntries(request.headers.entries()),
		};

		// // Find an active WebSocket connection to send the request to
		let targetWebSocket: WebSocket | null = null;
		// console.log('Active sessions:', this.sessions.size);
		// this.sessions.forEach((session, ws) => {
		// 	console.log('Available session:', session, ws);
		// });
		// for (const [ws, session] of this.sessions) {
		// 	// Use the first available WebSocket connection

		// 	// console.log("available sessions:", this.sessions.forEach);
		// 	console.log('Using WebSocket session:', session);

		// 	targetWebSocket = ws;
		// 	break;
		// }

		//we gonna user thta websocket connection always
		targetWebSocket = this.proxyclient;

		if (!targetWebSocket) {
			return new Response(
				JSON.stringify({
					status: 'error',
					message: 'No active WebSocket connections available',
					timestamp: new Date().toISOString(),
				}),
				{
					status: 503, // Service Unavailable
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		// Create a promise that will resolve when we get the response
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				console.log(`❌ Request ${requestData.id} timed out after 30 seconds`);
				resolve(new Response('Request timeout - no response from WebSocket client', { status: 504 })); // 504 Gateway Timeout
				this.pendingRequests.delete(requestData.id);
			}, 30000); // 30 second timeout

			// Store the resolve function to call it when we get the response
			// We'll use the request ID to match responses
			this.pendingRequests = this.pendingRequests || new Map();
			this.pendingRequests.set(requestData.id, { resolve, reject, timeout });

			try {
				// Send the request data to the WebSocket client
				targetWebSocket.send(JSON.stringify(requestData));
				console.log(`📤 Sent request ${requestData.id} to WebSocket client`);
			} catch (error) {
				clearTimeout(timeout);
				this.pendingRequests.delete(requestData.id);
				reject(new Error('Failed to send request to WebSocket client'));
			}
		});
	}

	sayhello(name: string): void {
		console.log(`Hello, ${name}!`);
	}

	base64ToArrayBuffer(base64: string): ArrayBuffer {
		var binaryString = atob(base64);
		var bytes = new Uint8Array(binaryString.length);
		for (var i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes.buffer;
	}

	async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
		// Get the session associated with the WebSocket connection.
		// const session = this.sessions.get(ws);

		try {
			// Parse the incoming message
			const messageData = JSON.parse(message as string);
			console.log('📩 Received WebSocket message:', messageData.id, messageData.isBinary || 'not binary');

			// Check if this is a response to a pending HTTP request
			if (messageData.id && this.pendingRequests.has(messageData.id)) {
				const pendingRequest = this.pendingRequests.get(messageData.id)!;
				clearTimeout(pendingRequest.timeout);
				this.pendingRequests.delete(messageData.id);

				let body;

				if (messageData.isBinary) {
					//parsing base64 encoded binary data
					console.log('decoding base64 binary data');
					body = this.base64ToArrayBuffer(messageData.body);
				} else {
					body = messageData.body;
				}

				const httpResponse = new Response(body, {
					status: messageData.status || 200,
					headers: messageData.headers || { 'Content-Type': 'application/json' },
				});

				console.log(`✅ Resolved HTTP request ${messageData.id} with status ${messageData.status}`);
				pendingRequest.resolve(httpResponse);
				return;
			}

			// // If it's not a response to an HTTP request, handle as regular WebSocket message
			// // Send a message to all WebSocket connections except the sender
			// this.sessions.forEach((attachment, connectedWs) => {
			// 	if (connectedWs !== ws) {
			// 		connectedWs.send(message);
			// 	}
			// });
		} catch (error) {
			console.error('❌ Error handling WebSocket message:', error);

			// Send error response if it was a malformed message
			ws.send(
				JSON.stringify({
					error: 'Failed to process message',
					details: error instanceof Error ? error.message : 'Unknown error',
				})
			);
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		console.log(`WebSocket closed: ${this.ctx.id}`);
		// this.sessions.delete(ws);

		try {
			console.log('deleting proxyName from storage' + this.proxyName);
			if (this.proxyName) {
				await this.ctx.storage.delete(this.proxyName);
				await this.env.REGISTRED_PROXIES.delete(this.proxyName);
				console.log('deleted proxyName from storage : ' + this.proxyName);
			}
		} catch (error) {
			console.error('Error deleting proxyName from storage:', error);
		}

		// Clean up
		for (const [requestId, pendingRequest] of this.pendingRequests) {
			clearTimeout(pendingRequest.timeout);
			pendingRequest.reject(new Error('WebSocket connection closed'));
		}
		this.pendingRequests.clear();

		console.log('WebSocket closed:', { code, reason, wasClean });
		ws.close(code, 'Durable Object is closing WebSocket');
	}
	async webSocketError(ws: WebSocket, error: Error) {
		try {
			console.log('deleting proxyName from storage' + this.proxyName);
			if (this.proxyName) {
				await this.ctx.storage.delete(this.proxyName);
				await this.env.REGISTRED_PROXIES.delete(this.proxyName);
				console.log('deleted proxyName from storage : ' + this.proxyName);
			}
		} catch (error) {
			console.error('Error deleting proxyName from storage:', error);
		}

		// Clean up
		for (const [requestId, pendingRequest] of this.pendingRequests) {
			clearTimeout(pendingRequest.timeout);
			pendingRequest.reject(new Error('WebSocket connection closed'));
		}
		this.pendingRequests.clear();

		console.error('WebSocket error:', error);
	}
}
