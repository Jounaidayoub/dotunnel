import { env } from 'cloudflare:workers';
import { Hono, } from 'hono';
import { doTunnel as MyDurableObject } from './cf/dotunnel';
import { CloudflareTunnelStore } from './cf/tunnelstore';
export { MyDurableObject };

const tunnelStore = new CloudflareTunnelStore(env.MY_DURABLE_OBJECT, env.REGISTRED_PROXIES);
const app = new Hono();

const parseTunnelName = (request: Request): string | null => {
	const url = new URL(request.url);
	const subdomain = url.hostname.split('.')[0];
	if (subdomain?.endsWith('-prxy')) {
		return subdomain.replace('-prxy', '');
	}
	return null;
}


app.use('*', async (c, next) => {
	const name = parseTunnelName(c.req.raw);
	if (name) {
		const tunnel = await tunnelStore.get(name);
		if (tunnel) {
			return await tunnel.forward(c.req.raw);
		}
		//not registered proxy/tunnel
		return c.text('Tunnel not found', 404);
	}
	return await next();
});

app.get('/', async (c) => {

	return c.text('Hello World!!');
});


app.get('/register/:name', async (c) => {
	const name = c.req.param('name');
	const isAvailable = await tunnelStore.isAvailable(name);
	if (!isAvailable) {
		return c.json('Tunnel name already taken', 409);
	}
	// Forwarding the original request preserves the external WebSocket upgrade handshake.
	return tunnelStore.register(name, c.req.raw);
});

app.get('is-available/:proxy', async (c) => {
	const name = c.req.param('proxy');
	if (!name) {
		return c.json('Proxy parameter is required', 400);
	}
	const available = await tunnelStore.isAvailable(name);
	return c.json({ available });
});

export default app;
