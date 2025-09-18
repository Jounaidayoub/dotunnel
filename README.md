# do-tunnel: Expose Your Localhost to the World

`do-tunnel` is a  lightweight HTTP tunnel proxy built on Cloudflare Workers and Durable Objects. It allows you to expose your local development server to the internet with a secure, public URL.

It's perfect for sharing your work-in-progress, testing webhooks from third-party services, or debugging APIs without the hassle of configuring firewalls, port forwarding, or complex network setups.
## How to Use
You can use the proxy by checking out  the [DoTunnel client](https://www.npmjs.com/package/dotunnel)  running `npx dotunnel` and follow the prompts to set up your tunnel. For more details, check out the [repo for the client DoTunnel client ](https://github.com/jounaidayoub/dotunnel-client).

## Features

-   **Instant Public URLs**: Get a public, shareable URL for your local server in seconds.
-   **Zero-Configuration Networking**: No need to mess with  firewall rules or port forwarding , just use the [DoTunnel client](https://www.npmjs.com/package/dotunnel) by running `npx dotunnel`.
-   **Low Latency**: Built on Cloudflare's edge network, requests are routed through a Durable Object running close to you, ensuring minimal latency.
-   **Secure**: The tunnel is established over a secure WebSocket connection.
-   **Custom Subdomains**: Choose a unique subdomain prefix for your tunnel.

## How It Works

The project uses a combination of a Cloudflare Worker, a Durable Object, and a local CLI client to create a secure tunnel from the public internet to your local machine.

1.  **Registration**: The developer uses [the DoTunnel CLI client](https://www.npmjs.com/package/dotunnel) to register a unique proxy name (e.g., `mytodo`) and choose a local port (e.g., `3000`). This name becomes a prefix for the public URL (`mytodo-prxy.yourdomain.com`) for that local service.
2.  **WebSocket Tunnel**: The CLI client establishes a persistent, secure WebSocket connection to a dedicated Durable Object instance on Cloudflare's network, identified by the chosen proxy name.
3.  **Request Interception**: A Cloudflare Worker intercepts all incoming HTTP requests to `*-prxy.yourdomain.com`.
4.  **Request Forwarding**: The Worker identifies the proxy name from the request's subdomain and forwards the request to the corresponding Durable Object.
5.  **Tunneling to Localhost**: The Durable Object sends the request details (headers, body, method, etc.) through the established WebSocket tunnel to the CLI client running on your local machine.
6.  **Local Proxying**: The CLI client receives the request, forwards it to your local server (e.g., `localhost:3000`), and captures the response.
7.  **Response Path**: The CLI client sends the response back through the WebSocket to the Durable Object, which then delivers it to the original requester.

This entire process happens in milliseconds, creating a seamless and fast link between the public internet and your local development environment.



## Use Cases

-   **Webhook Development**: Expose your local webhook handler to services like Stripe, GitHub, or Twilio for easy testing.
-   **API Demos**: Share a live demo of your backend API with colleagues or clients without deploying it.
-   **Frontend Development**: Connect your local frontend application to a backend running on another machine.
-   **Mobile App Development**: Test API calls from a mobile app to your local development server.


## TODO

now the project has basic features like creating a tunnel and forwarding requests to localhost,  but there is still a space for improvement :

- **Binary formats**: the client currently supports binary formats by converting them to base64, which not idea and add overhead on both the client and the worker side .
- **Size Limit**: since we are using durable objects for websocket connections ,for some reason , Cloudflare imposes  a limit of ONLY 1MB on how much data u can send over a websocket message, so we need to implement a way to chunk large payloads.

- **Websocket Support**: Ironically the project core features are around websockts , yet still we cant proxy WebSocket connections. alot of dev severs use websockt for HMR.so this has to be DONE , Add support for tunneling WebSocket connections .