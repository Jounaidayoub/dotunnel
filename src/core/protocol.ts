export type TunnelRequestPayload = {
	id: string;
	path: string;
	method: string;
	body?: string;
	headers: Record<string, string>;
};

export type TunnelResponsePayload = {
	id: string;
	status?: number;
	headers?: Record<string, string>;
	body?: string;
	isBinary?: boolean;
};

export type TunnelErrorPayload = {
	error: string;
	details?: string;
};

export type TunnelMessage = TunnelResponsePayload | TunnelErrorPayload;

export const encodeTunnelRequest = (payload: TunnelRequestPayload): string => {
	return JSON.stringify(payload);
};

export const decodeTunnelMessage = (raw: ArrayBuffer | string): TunnelMessage => {
	const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
	return JSON.parse(text) as TunnelMessage;
};

export const decodeTunnelResponse = (
	raw: ArrayBuffer | string
): TunnelResponsePayload | null => {
	const message = decodeTunnelMessage(raw);
	if ("id" in message) {
		return message;
	}
	return null;
};
