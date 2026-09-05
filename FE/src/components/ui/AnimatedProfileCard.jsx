import * as React from 'react';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../../context/ThemeContext';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const ProfileCardContent = React.forwardRef(
  (
    {
      className,
      name,
      location,
      bio,
      avatarSrc,
      avatarFallback,
      variant = 'default',
      socials = [],
      showAvatar = true,
      titleStyle,
      cardStyle,
      descriptionClassName,
      bioClassName,
      footerClassName,
      ...props
    },
    ref
  ) => {
    const isOnAccent = variant === 'on-accent';
    return (
      <div
        ref={ref}
        className={cn(
          'w-full h-full p-8 flex flex-col rounded-3xl border-0',
          isOnAccent ? 'text-white' : 'bg-(--surface) text-(--text-primary)',
          className
        )}
        style={{
          ...(isOnAccent ? { backgroundColor: 'var(--brand)' } : {}),
          ...cardStyle,
        }}
        {...props}
      >
        <div className="p-0">
          <div className={cn('flex-shrink-0', !showAvatar && 'invisible')}>
            <div
              className="h-16 w-16 rounded-full overflow-hidden flex items-center justify-center text-lg font-black shrink-0 ring-2 ring-offset-2"
              style={{
                backgroundColor: isOnAccent ? 'rgba(255,255,255,0.15)' : 'var(--brand-soft)',
                color: isOnAccent ? 'white' : 'var(--brand-foreground)',
                borderColor: 'var(--brand)',
                '--tw-ring-color': 'var(--brand)',
              }}
            >
              {avatarSrc ? (
                <img src={avatarSrc} alt={name} className="w-full h-full object-cover" />
              ) : (
                <span>{avatarFallback}</span>
              )}
            </div>
          </div>
          <p
            className={cn(
              'pt-6 text-left text-xs font-semibold',
              !isOnAccent && 'text-(--text-tertiary)',
              descriptionClassName
            )}
            style={isOnAccent ? { color: 'rgba(255,255,255,0.8)' } : {}}
          >
            {location}
          </p>
          <h3
            className={cn('text-2xl font-black text-left tracking-tight', className)}
            style={{
              ...(isOnAccent ? { color: 'white' } : {}),
              ...titleStyle,
            }}
          >
            {name}
          </h3>
        </div>

        <div className="p-0 flex-grow mt-6">
          <p
            className={cn(
              'text-sm leading-relaxed text-left',
              !isOnAccent && 'text-(--text-secondary)',
              bioClassName
            )}
            style={isOnAccent ? { opacity: 0.9, color: 'white' } : {}}
          >
            {bio}
          </p>
        </div>

        {socials.length > 0 && (
          <div className={cn('p-0 mt-6', footerClassName)}>
            <div
              className={cn(
                'flex items-center gap-4',
                !isOnAccent && 'text-(--text-tertiary)'
              )}
              style={isOnAccent ? { color: 'rgba(255,255,255,0.8)' } : {}}
            >
              {socials.map((social) => (
                <a
                  key={social.id}
                  href={social.url}
                  aria-label={social.label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'transition-opacity',
                    isOnAccent ? 'hover:opacity-75' : 'hover:text-(--text-primary)'
                  )}
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);
ProfileCardContent.displayName = 'ProfileCardContent';

export const AnimatedProfileCard = React.forwardRef(
  (
    {
      className,
      accentColor = 'var(--brand)',
      onAccentForegroundColor = '#ffffff',
      onAccentMutedForegroundColor = 'rgba(255, 255, 255, 0.8)',
      baseCard,
      overlayCard,
      ...props
    },
    ref
  ) => {
    const containerRef = useRef(null);
    const [hovered, setHovered] = useState(false);
    const { theme } = useTheme();

    const setContainerRef = React.useCallback(
      (node) => {
        containerRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    const initialClipPath = 'circle(40px at 64px 64px)';
    const hoverClipPath = 'circle(150% at 64px 64px)';

    return (
      <div
        ref={setContainerRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          '--accent-color': accentColor,
          '--on-accent-foreground': onAccentForegroundColor,
          '--on-accent-muted-foreground': onAccentMutedForegroundColor,
          borderColor: 'var(--accent-color)',
        }}
        className={cn(
          'relative h-fit w-[350px] max-w-full overflow-hidden rounded-3xl border-2',
          className
        )}
        {...props}
      >
        <div className="h-full w-full">{baseCard}</div>
        <motion.div
          className="absolute inset-0 h-full w-full"
          initial={{ clipPath: initialClipPath }}
          animate={{ clipPath: hovered ? hoverClipPath : initialClipPath }}
          transition={{ duration: hovered ? 0.7 : 1.2, ease: hovered ? [0.7, 0, 0.84, 0] : [0.16, 1, 0.3, 1] }}
        >
          {overlayCard}
        </motion.div>
      </div>
    );
  }
);
AnimatedProfileCard.displayName = 'AnimatedProfileCard';
