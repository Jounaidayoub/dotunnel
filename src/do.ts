import { DurableObject } from 'cloudflare:workers';

export class MyDurableObject extends DurableObject<Env> {
	sessions: Map<WebSocket, { [key: string]: string }>;

	// Keeps track of pending HTTP requests waiting for WebSocket responses
	pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: number }>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sessions = new Map();
		this.pendingRequests = new Map();

		this.ctx.getWebSockets().forEach((ws) => {
			let attachment = ws.deserializeAttachment();
			if (attachment) {
				this.sessions.set(ws, { ...attachment });
			}
		});

		// Sets an application level auto response that does not wake hibernated WebSockets.
		this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	async fetch(request: Request): Promise<Response> {
		// Creates two ends of a WebSocket connection.
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		this.ctx.acceptWebSocket(server);

		// Generate a random UUID for the session.
		const id = crypto.randomUUID();

		// Attach the session ID to the WebSocket connection and serialize it.
		// This is necessary to restore the state of the connection when the Durable Object wakes up.
		server.serializeAttachment({ id });

		// Add the WebSocket connection to the map of active sessions.
		this.sessions.set(server, { id });

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async processRequest(request: Request): Promise<Response> {
		console.log(`number of pending requests: ${this.pendingRequests.size}`);
		// Get request data
		const requestBody = await request.text();
		const requestData = {
			id: crypto.randomUUID(),
			path: new URL(request.url).pathname.replace(/^\/serve\/nisada/, ''), // Remove /serve prefix
			method: request.method,
			body: requestBody || undefined,
			headers: Object.fromEntries(request.headers.entries()),
		};

		// Find an active WebSocket connection to send the request to
		let targetWebSocket: WebSocket | null = null;
		console.log('Active sessions:', this.sessions.size);
		this.sessions.forEach((session, ws) => {
			console.log('Available session:', session, ws);
		});
		for (const [ws, session] of this.sessions) {
			// Use the first available WebSocket connection

			// console.log("available sessions:", this.sessions.forEach);
			console.log('Using WebSocket session:', session);

			targetWebSocket = ws;
			break;
		}

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
			}, 3000); // 30 second timeout

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
		const session = this.sessions.get(ws);

		try {
			// Parse the incoming message
			const messageData = JSON.parse(message as string);
			console.log('📩 Received WebSocket message:', messageData);

			// Check if this is a response to a pending HTTP request
			if (messageData.id && this.pendingRequests.has(messageData.id)) {
				const pendingRequest = this.pendingRequests.get(messageData.id)!;
				clearTimeout(pendingRequest.timeout);
				this.pendingRequests.delete(messageData.id);

				let body;

				if (messageData.isBinary) {
					//parsing base64 encoded binary data
					console.log("decoding base64 binary data");
					body=this.base64ToArrayBuffer(messageData.body);

				}
				else{
					body=messageData.body;
``				}
				// Create HTTP response from WebSocket response
				const httpResponse = new Response(messageData.body, {
					status: messageData.status || 200,
					headers: messageData.headers || { 'Content-Type': 'application/json' },
				});

				console.log(`✅ Resolved HTTP request ${messageData.id} with status ${messageData.status}`);
				pendingRequest.resolve(httpResponse);
				return;
			}

			// If it's not a response to an HTTP request, handle as regular WebSocket message
			// Send a message to all WebSocket connections except the sender
			this.sessions.forEach((attachment, connectedWs) => {
				if (connectedWs !== ws) {
					connectedWs.send(message);
				}
			});
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
		// Remove the WebSocket from sessions
		this.sessions.delete(ws);

		// Clean up any pending requests that were waiting for this WebSocket
		for (const [requestId, pendingRequest] of this.pendingRequests) {
			clearTimeout(pendingRequest.timeout);
			pendingRequest.reject(new Error('WebSocket connection closed'));
		}
		this.pendingRequests.clear();

		console.log('WebSocket closed:', { code, reason, wasClean });
		ws.close(code, 'Durable Object is closing WebSocket');
	}
}
