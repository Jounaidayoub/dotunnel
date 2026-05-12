export const parseTunnelName = (request: Request): string | null => {
	const url = new URL(request.url);
	const hostname = url.hostname;
	const firstLabel = hostname.split(".")[0];
	if (!firstLabel) {
		return null;
	}
	const suffix = "-prxy";
	if (!firstLabel.endsWith(suffix)) {
		return null;
	}
	const name = firstLabel.slice(0, -suffix.length);
	return name.length > 0 ? name : null;
};
