// Notification generation is not delivery. Real delivery stays disabled until a provider and recipient are configured.
export async function deliver(env,msg){if(!env.NOTIFY_PROVIDER||env.NOTIFY_PROVIDER==='none')return {status:'generated',detail:'Message generated; no delivery provider configured.'};return {status:'failed',detail:`Unknown provider "${env.NOTIFY_PROVIDER}".`};}
