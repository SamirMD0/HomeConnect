export interface RendererProbe {
  executeJavaScript<T>(code: string): Promise<T>;
}

// An HTTP 200 / loaded HTML document does not prove that React can render.
// Keep the business window hidden until its first real screen is available.
export async function waitForRendererReady(renderer: RendererProbe, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await renderer.executeJavaScript<{ ready: boolean; failed: boolean }>(`(() => {
      const root = document.getElementById('root');
      return { ready: Boolean(root?.querySelector('form, main, h1, h2, nav')),
        failed: /Something went wrong/.test(root?.textContent || '') };
    })()`);
    if (result.failed) throw new Error('The application screen failed to render');
    if (result.ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The application screen did not become ready');
}
