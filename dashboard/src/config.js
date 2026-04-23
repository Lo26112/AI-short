// Configuration for API endpoints
// If VITE_API_URL is set (e.g. in production), use it.
// Otherwise, default to empty string which means relative paths (proxied in dev).

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const getApiUrl = (path) => {
    if (path.startsWith('http')) return path;
    // Ensure path starts with / if not present
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${normalizedPath}`;
};

/** 与后端 /api/workbench/static-assets/inline 一致：GitHub 私有仓需服务端 GITHUB_TOKEN，避免浏览器直链 raw 无法鉴权。 */
export function getStaticAssetInlineUrl(relativePath) {
    if (!relativePath) return '';
    return getApiUrl(
        `/api/workbench/static-assets/inline?relative_path=${encodeURIComponent(relativePath)}`
    );
}
