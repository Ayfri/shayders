<script lang="ts" module>
	import { SITE_NAME, SITE_REPOSITORY_URL, SITE_URL } from '#lib/site.js';

	const CONTACT_EMAIL = 'pierre.ayfri@gmail.com';

	const SECTIONS = [
		{ id: 'publisher', title: 'Publisher' },
		{ id: 'hosting', title: 'Hosting' },
		{ id: 'content', title: 'Intellectual property' },
		{ id: 'data', title: 'Personal data' },
		{ id: 'cookies', title: 'Cookies and local storage' },
		{ id: 'contact', title: 'Contact' },
	];
</script>

<script lang="ts">
	import SeoHead from '#components/SeoHead.svelte';
</script>

<SeoHead
	title="Legal notice - {SITE_NAME}"
	description="Legal notice of {SITE_NAME}: publisher, hosting providers, intellectual property, personal data and cookies."
/>

{#snippet heading(index: number)}
	<h2 id={SECTIONS[index].id} class="scroll-mt-6 text-xl font-semibold text-white">{SECTIONS[index].title}</h2>
{/snippet}

<div class="min-h-full bg-background text-foreground">
	<section class="relative isolate overflow-hidden border-b border-border">
		<div class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_120%_at_15%_0%,--alpha(var(--color-accent)/12%),transparent_70%)]"></div>
		<div class="mx-auto max-w-5xl px-6 py-12 lg:px-10 lg:py-16">
			<h1 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">Legal notice</h1>
			<p class="mt-3 max-w-2xl text-sm leading-6 text-muted">
				Mentions légales of {SITE_URL.replace('https://', '')}, as required by the French law n° 2004-575 of June 21, 2004 for confidence in the digital economy (LCEN), and how your data is handled under the GDPR.
			</p>
		</div>
	</section>

	<div class="mx-auto grid max-w-5xl gap-10 px-6 py-10 lg:grid-cols-[12rem_1fr] lg:px-10">
		<nav aria-label="Legal notice sections" class="hidden lg:block">
			<ul class="sticky top-6 flex flex-col gap-1 border-l border-border text-sm">
				{#each SECTIONS as section (section.id)}
					<li><a href="#{section.id}" class="-ml-px block border-l border-transparent py-1 pl-4 text-muted transition-colors hover:border-accent hover:text-foreground">{section.title}</a></li>
				{/each}
			</ul>
		</nav>

		<article class="legal flex max-w-3xl flex-col gap-10 text-sm leading-7 text-muted">
			<section>
				{@render heading(0)}
				<p>{SITE_NAME} is a free, non-commercial, open-source project published by an individual.</p>
				<dl>
					<dt>Publisher and publication director</dt>
					<dd>Pierre Roy (Ayfri)</dd>
					<dt>Email</dt>
					<dd><a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a></dd>
					<dt>Website</dt>
					<dd><a href="https://ayfri.com" target="_blank" rel="noopener noreferrer">ayfri.com</a></dd>
				</dl>
			</section>

			<section>
				{@render heading(1)}
				<p>The website, its server code and uploaded media files run on:</p>
				<dl>
					<dt>Cloudflare, Inc.</dt>
					<dd>101 Townsend St, San Francisco, CA 94107, United States, <a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer">cloudflare.com</a></dd>
				</dl>
				<p>Accounts and shaders are stored in a database hosted by:</p>
				<dl>
					<dt>Hetzner Online GmbH</dt>
					<dd>Industriestr. 25, 91710 Gunzenhausen, Germany, +49 9831 505-0, <a href="https://www.hetzner.com" target="_blank" rel="noopener noreferrer">hetzner.com</a></dd>
				</dl>
			</section>

			<section>
				{@render heading(2)}
				<p>
					The source code of {SITE_NAME} is released under the
					<a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer">GNU GPL-3.0 license</a> and available on
					<a href={SITE_REPOSITORY_URL} target="_blank" rel="noopener noreferrer">GitHub</a>. The {SITE_NAME} name and logo belong to their author.
				</p>
				<p>
					Shaders, descriptions and media you publish remain yours. By making a shader public or unlisted, you allow {SITE_NAME} to display it and other users to view and fork it on the site.
					You are responsible for what you publish and confirm you hold the rights to it. Content that infringes someone's rights or the law can be reported by email and will be removed.
				</p>
			</section>

			<section>
				{@render heading(3)}
				<p>When you create an account, {SITE_NAME} stores:</p>
				<ul>
					<li>your email address, used to sign in and verify your account, never shown publicly;</li>
					<li>your password, stored hashed;</li>
					<li>your display name and avatar, shown on your profile and next to your shaders;</li>
					<li>your shaders and the images or videos you upload for them.</li>
				</ul>
				<p>
					This data is processed to provide the service you signed up for (GDPR art. 6.1.b), it is never sold or shared with third parties beyond the hosting providers above.
					It is kept until you delete your account, which you can do at any time from your profile page and which removes your shaders and uploads.
				</p>
				<p>
					You have the right to access, rectify, erase, port and object to the processing of your data. Write to <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a> to use them.
					You can also file a complaint with the <a href="https://www.cnil.fr/en/complaints" target="_blank" rel="noopener noreferrer">CNIL</a>.
				</p>
			</section>

			<section>
				{@render heading(4)}
				<ul>
					<li><code>shayders_auth</code>: a cookie that keeps you signed in for up to 30 days, strictly necessary, set only when you log in.</li>
					<li><code>shayders_draft</code> and <code>shayders:editorSettings</code>: your unsaved editor draft and editor preferences, kept in your browser's local storage and never sent to the server.</li>
					<li>
						Google Analytics: audience measurement cookies (<code>_ga</code>, <code>_ga_*</code>) set by Google LLC to count visits and see which pages are used.
						You can block them with your browser settings or the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google Analytics opt-out add-on</a>.
					</li>
				</ul>
			</section>

			<section>
				{@render heading(5)}
				<p>
					For any question about this notice, your data or published content, email <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.
					Bugs and feature requests go to <a href="{SITE_REPOSITORY_URL}/issues" target="_blank" rel="noopener noreferrer">GitHub issues</a>.
				</p>
			</section>
		</article>
	</div>
</div>

<style>
	.legal :global(h2) { margin-bottom: 0.75rem; }
	.legal p + p, .legal p + dl, .legal dl + p, .legal p + ul, .legal ul + p { margin-top: 0.75rem; }

	.legal dl {
		display: grid;
		grid-template-columns: minmax(0, 14rem) 1fr;
		gap: 0.5rem 1.5rem;
		border-radius: 0.75rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		padding: 1rem 1.25rem;
	}

	.legal dt { font-weight: 500; color: var(--color-foreground); }

	@media (width < 40rem) {
		.legal dl { grid-template-columns: 1fr; }
		.legal dd { margin-bottom: 0.5rem; }
	}

	.legal ul { display: flex; flex-direction: column; gap: 0.5rem; padding-left: 1.25rem; list-style: disc; }
	.legal li::marker { color: var(--color-accent); }

	.legal a {
		color: var(--color-accent);
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, var(--color-accent) 35%, transparent);
		text-underline-offset: 3px;
		transition: color 0.15s;
	}

	.legal a:hover { color: var(--color-accent-light); }

	.legal code {
		border-radius: 0.25rem;
		background: var(--color-panel);
		padding: 0.1rem 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.85em;
		color: var(--color-foreground);
	}
</style>
