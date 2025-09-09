import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';

const app = new Hono();
import {MyDurableObject} from './do';
export { MyDurableObject };



// export default {
// 	/**
// 	 * This is the standard fetch handler for a Cloudflare Worker
// 	 *
// 	 * @param request - The request submitted to the Worker from the client
// 	 * @param env - The interface to reference bindings declared in wrangler.jsonc
// 	 * @param ctx - The execution context of the Worker
// 	 * @returns The response to be sent back to the client
// 	 */
// 	async fetch(request, env, ctx): Promise<Response> {
// 		// Create a stub to open a communication channel with the Durable Object
// 		// instance named "foo".
// 		//
// 		// Requests from all Workers to the Durable Object instance named "foo"
// 		// will go to a single remote Durable Object instance.

// 		const stub = env.MY_DURABLE_OBJECT.getByName('foo');

// 		// Call the `sayHello()` RPC method on the stub to invoke the method on
// 		// the remote Durable Object instance.
// 		const greeting = await stub.sayHello('world');

// 		return new Response(greeting);
// 	},
// } satisfies ExportedHandler<Env>;

app.get('/', (c) => c.text('Hello World!'));

app.get('/:proxy', async (c) => {
	const env = c.env as Env;
	let proxy: string | undefined;
	try {
		proxy = c.req.param('proxy');
	} catch (error) {
		return c.text('Invalid proxy', 400);
	}
	if (!proxy) {
		return c.text('Proxy parameter is required', 400);
	}	
	const stub = env.MY_DURABLE_OBJECT.getByName(proxy);
	stub.sayhello('world');
	return stub.fetch(c.req.raw);
});



export default app;
