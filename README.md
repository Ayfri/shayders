# Shayders

A modern, web-based GLSL shader editor for creating and experimenting with fragment shaders in real-time. Built with SvelteKit, featuring multi-buffer rendering, texture channels, and community shader sharing.

Check out the live demo: [shayders.ayfri.com](https://shayders.ayfri.com)

## Features

### 🎨 Shader Editing
- **Real-time GLSL editing** with Monaco Editor (same as VS Code)
- **Syntax highlighting** and error detection for GLSL
- **Multi-buffer rendering** - create complex effects with up to 4 render passes
- **Live preview** with WebGL canvas

### 🎯 Built-in Uniforms
Access these uniforms in your shaders:
- `uAspect` (float) - Canvas aspect ratio
- `uDate` (vec4) - Current date (year, month, day, timeOfDay)
- `uDeltaTime` (float) - Time since last frame
- `uFrameCount` (int) - Total frames rendered
- `uFrameRate` (float) - Current FPS
- `uMouse` (vec3) - Mouse position (x, y) and button state
- `uResolution` (vec2) - Canvas resolution
- `uTime` (float) - Current time in seconds

### 🖼️ Texture Channels
- **4 texture channels** (uChannel0-uChannel3) for images and videos
- Direct-to-R2 uploads for authenticated users with worker-based image optimization and client-side validation
- Support for PNG, JPG, GIF, WebP, AVIF, MP4, and WebM files
- Automatic texture binding and sampling

### 🌐 Community Features
- **Shader sharing** - Publish and discover community shaders
- **User profiles** - View shaders by author
- **Live previews** on shader cards
- **Authentication** with email verification

### 🚀 Performance
- **WebGL optimized** rendering
- **Thumbnail generation** for quick previews
- **Efficient multi-pass** rendering pipeline
- **Cloudflare Workers** deployment for global CDN


## Technologies Used

- Built with [SvelteKit](https://svelte.dev/docs/kit/introduction) and [Svelte 5](https://svelte.dev/blog/svelte-5)
- Uses [Monaco Editor](https://microsoft.github.io/monaco-editor/) for code editing
- [PocketBase](https://pocketbase.io/) for database/backend services
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Lucide](https://lucide.dev/) for icons
- Inspired by Shadertoy

### Key Components

- **ShaderCanvas**: Handles WebGL rendering, uniform binding, and multi-buffer pipeline
- **GlslEditor**: Monaco-based editor with GLSL syntax highlighting
- **ChannelsPanel**: Texture channel management
- **BuiltinsPanel**: Uniform documentation and controls
- **ShaderPreview**: Live thumbnail generation for shader cards

### Environment Setup

Make sure to configure these environment variables in your Cloudflare Workers environment:

- `PUBLIC_POCKETBASE_URL` - Your PocketBase instance URL
- Database connection settings for PocketBase

For direct shader asset uploads through Cloudflare R2, add these variables as well:

- `R2_ACCOUNT_ID` - Your Cloudflare account ID
- `R2_ACCESS_KEY_ID` - R2 access key ID with write access to the bucket
- `R2_SECRET_ACCESS_KEY` - Matching R2 secret access key
- `R2_BUCKET_NAME` - Bucket that stores image and video shader assets
- `R2_PUBLIC_BASE_URL` - Public asset domain or bucket domain served with CORS enabled
- `R2_S3_ENDPOINT` - Optional override for the S3-compatible endpoint

### R2 Asset Limits

The editor enforces these defaults for authenticated uploads:

- Images: `2 MB` max, `2048x2048` max, optimized/compressed in a worker before upload
- Videos: `10 MB` max, `1920x1080` max, `30 seconds` max
- Per-user storage quota: `50 MB`

### R2 Bucket CORS

WebGL texture uploads require permissive cross-origin reads on the public asset domain. A working baseline for the R2 bucket is:

```json
[
	{
		"AllowedOrigins": [
			"http://localhost:5173",
			"https://shayders.example.com"
		],
		"AllowedMethods": ["GET", "HEAD", "PUT"],
		"AllowedHeaders": ["*"],
		"ExposeHeaders": ["ETag"],
		"MaxAgeSeconds": 3600
	}
]
```

Use a dedicated public domain such as `assets.your-domain.com` for `R2_PUBLIC_BASE_URL`, and keep the bucket private except for that public asset route.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
