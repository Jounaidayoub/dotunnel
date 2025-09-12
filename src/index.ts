import { DurableObject, env } from 'cloudflare:workers';
import { Context, Hono, Next } from 'hono';
import { jwt, sign } from 'hono/jwt';
const app = new Hono();
import { MyDurableObject } from './do';
export { MyDurableObject };

const whoareu = (c:Context, next :Next) => {
	console.log('whoareu middleware called');
	const clientH = c.req.header('client');
	if (clientH && clientH === 'dotunnel-node-cli-client') {
		return next();
	}
	return c.text('Unauthorized', 401);
}
const isProxyAvailable = async (proxy : string) => {
	try {
		const value = await env.REGISTRED_PROXIES.get(proxy);
		if (!value) {
			return true;
		}
	}catch (error) {
		console.error('Error checking proxy availability form KV ', error);
		return false;
	}

	return false;
}

const isProxyRequest = async (c: Context, next: Next) => {
	const env = c.env as Env;

	const url = new URL(c.req.url);
	console.log('url: ', url, url.pathname, url.hostname);
	const subdomain = url.hostname.split('.')[0];

	const proxy = subdomain?.replace('-prxy', '');

	if (subdomain && subdomain.endsWith('-prxy')) {
		const stub = env.MY_DURABLE_OBJECT.getByName(proxy);

		try {
			
			return await stub.processRequest(c.req.raw, proxy);
		} catch (error) {
			console.error('Error processing request through proxy:', error);
			return c.text('Internal server error', 500);
		}
	}

	await next();
};
app.use('*', isProxyRequest);

app.get('/', async (c) => {
	// const env = c.env as Env;

	// const url = new URL(c.req.url);
	// console.log('url: ', url, url.pathname, url.hostname);
	// const subdomain = url.hostname.split('.')[0];

	// const proxy = subdomain?.replace('-prxy', '');

	// if (subdomain && subdomain.endsWith('-prxy')) {
	// 	const stub = env.MY_DURABLE_OBJECT.getByName(proxy);

	// 	try {
	// 		return await stub.processRequest(c.req.raw, proxy);
	// 	} catch (error) {
	// 		console.error('Error processing request through proxy:', error);
	// 		return c.text('Internal server error', 500);
	// 	}
	// }

	return c.text('Hello Worldsa!');
});

app.get('register/:proxy', whoareu, async (c) => {
	console.log('Authorized request to register proxy');
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

	const available = await isProxyAvailable(proxy);
	if (!available) {
		return c.text('Proxy name is already taken', 409);
	}

	// put the porxy name in kv
	await env.REGISTRED_PROXIES.put(proxy, "registered");

	// env.MY_DURABLE_OBJECT.
	const stub = env.MY_DURABLE_OBJECT.getByName(proxy);
	// stub.sayhello('world');
	return stub.fetch(c.req.raw);
	// return c.text('Authorized : ' + proxy);
});

app.get('is-available/:proxy', whoareu, async (c) => {
	const env = c.env as Env;
	let proxy: string | undefined;
	try {
		proxy = c.req.param('proxy');
	} catch (error) {
		return c.text('Invalid proxy', 400);
	}

	if (await isProxyAvailable(proxy)) {
		return c.json({ available: true });
	} else {
		return c.json({ available: false });
	}

});

export default app;
