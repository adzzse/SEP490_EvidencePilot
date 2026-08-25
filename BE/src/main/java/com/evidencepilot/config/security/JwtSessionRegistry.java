package com.evidencepilot.config.security;

import com.evidencepilot.model.Session;
import com.evidencepilot.repository.SessionRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

// The database is authoritative in production; the set exists only for isolated unit tests.
@Component
public class JwtSessionRegistry {

    private static final long DEFAULT_EXPIRATION_MS = 24L * 60 * 60 * 1000;

    private final Set<String> validJtis = ConcurrentHashMap.newKeySet();
    private final SessionRepository sessions;
    private final long expirationMs;

    // test-only: keeps the registry purely in-memory
    public JwtSessionRegistry() {
        this(null, DEFAULT_EXPIRATION_MS);
    }

    @Autowired
    public JwtSessionRegistry(SessionRepository sessions,
            @Value("${jwt.expiration-ms:" + DEFAULT_EXPIRATION_MS + "}") long expirationMs) {
        this.sessions = sessions;
        this.expirationMs = expirationMs;
    }

    @PostConstruct
    void removeExpiredSessions() {
        if (sessions == null) return;
        sessions.deleteByExpiresAtBefore(LocalDateTime.now());
    }

    public boolean isValid(String jti) {
        return jti != null && (sessions == null ? validJtis.contains(jti) : sessions.existsById(jti));
    }

    public void register(String jti) {
        if (jti == null) return;
        if (sessions == null) {
            validJtis.add(jti);
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        sessions.save(new Session(jti, null, now, now.plusNanos(expirationMs * 1_000_000)));
    }

    @Transactional
    public boolean rotate(String oldJti, String newJti) {
        if (oldJti == null || newJti == null) return false;
        if (sessions == null) {
            synchronized (validJtis) {
                if (!validJtis.remove(oldJti)) return false;
                validJtis.add(newJti);
                return true;
            }
        }
        if (sessions.consume(oldJti) != 1) return false;
        register(newJti);
        return true;
    }
}
