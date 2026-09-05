import './UserReflectiveCard.css';

export default function UserReflectiveCard({
  user,
  blurStrength = 8,
  metalness = 1,
  roughness = 0.35,
  overlayColor = 'rgba(0, 0, 0, 0.35)',
  displacementStrength = 18,
  noiseScale = 1,
  specularConstant = 1.1,
  grayscale = 0.2,
  glassDistortion = 0,
}) {
  if (!user) return null;

  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown User';
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.email?.[0]?.toUpperCase() || '?';
  const baseFrequency = 0.03 / Math.max(0.1, noiseScale);
  const saturation = 1 - Math.max(0, Math.min(1, grayscale));

  const cssVariables = {
    '--blur-strength': `${blurStrength}px`,
    '--metalness': metalness,
    '--roughness': roughness,
    '--overlay-color': overlayColor,
    '--text-color': 'white',
    '--saturation': saturation,
  };

  const statusColor =
    user.accountStatus === 'ACTIVE'
      ? 'text-emerald-300 border-emerald-300/30 bg-emerald-500/10'
      : user.accountStatus === 'VERIFYING_EMAIL'
        ? 'text-amber-300 border-amber-300/30 bg-amber-500/10'
        : user.accountStatus === 'BANNED'
          ? 'text-rose-300 border-rose-300/30 bg-rose-500/10'
          : 'text-slate-300 border-white/20 bg-white/10';

  return (
    <div className="reflective-card-container" style={cssVariables}>
      <svg className="reflective-svg-filters" aria-hidden="true">
        <defs>
          <filter id="metallic-displacement" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="turbulence" baseFrequency={baseFrequency} numOctaves="2" result="noise" />
            <feColorMatrix in="noise" type="luminanceToAlpha" result="noiseAlpha" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={displacementStrength}
              xChannelSelector="R"
              yChannelSelector="G"
              result="rippled"
            />
            <feSpecularLighting
              in="noiseAlpha"
              surfaceScale={displacementStrength}
              specularConstant={specularConstant}
              specularExponent="20"
              lightingColor="#ffffff"
              result="light"
            >
              <fePointLight x="0" y="0" z="300" />
            </feSpecularLighting>
            <feComposite in="light" in2="rippled" operator="in" result="light-effect" />
            <feBlend in="light-effect" in2="rippled" mode="screen" result="metallic-result" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="solidAlpha"
            />
            <feMorphology in="solidAlpha" operator="erode" radius="45" result="erodedAlpha" />
            <feGaussianBlur in="erodedAlpha" stdDeviation="10" result="blurredMap" />
            <feComponentTransfer in="blurredMap" result="glassMap">
              <feFuncA type="linear" slope="0.5" intercept="0" />
            </feComponentTransfer>
            <feDisplacementMap
              in="metallic-result"
              in2="glassMap"
              scale={glassDistortion}
              xChannelSelector="A"
              yChannelSelector="A"
              result="final"
            />
          </filter>
        </defs>
      </svg>

      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="reflective-image" />
      ) : (
        <div className="reflective-image-fallback">{initials}</div>
      )}

      <div className="reflective-noise" />
      <div className="reflective-sheen" />
      <div className="reflective-border" />

      <div className="reflective-content">
        <div className="card-header">
          <div className="security-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>SECURE ACCESS</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${statusColor}`}>{user.accountStatus}</span>
        </div>

        <div className="card-body">
          <div className="user-info">
            <h2 className="user-name">{fullName.toUpperCase()}</h2>
            <p className="user-role">{user.role}</p>
            <p className="user-email">{user.email}</p>
          </div>
          <div className="detail-extra w-full">
            {user.studentCode && (
              <div className="detail-extra-row">
                <span>Student Code</span>
                <span className="font-mono font-bold">{user.studentCode}</span>
              </div>
            )}
            <div className="detail-extra-row">
              <span>Created</span>
              <span className="font-mono">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</span>
            </div>
            <div className="detail-extra-row">
              <span>User ID</span>
              <span className="font-mono text-[9px] truncate max-w-[160px]">{user.id}</span>
            </div>
          </div>
        </div>

        <div className="card-footer">
          <div className="id-section">
            <span className="label">ID Number</span>
            <span className="value">{String(user.id).slice(0, 14).toUpperCase()}</span>
          </div>
          <div className="fingerprint-section">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="fingerprint-icon">
              <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.72-.72 4.52a10.78 10.78 0 0 1-2.87 4.46M12 10a2 2 0 0 1 2 2c0 1.02.1 2.72.72 4.52a10.78 10.78 0 0 0 2.87 4.46M8.56 8.56a6 6 0 0 1 6.88 0M12 6a6 6 0 0 1 6 6c0 2.5-1 4.5-2.5 6M12 6a6 6 0 0 0-6 6c0 2.5 1 4.5 2.5 6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
