package com.evidencepilot.event;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class EntityChangedBroadcaster {

    /**
     * Phase 0: per-recipient user destination. The former global
     * {@code /topic/entities} broadcast leaked unrelated projects to every
     * authenticated session; recipients now come from {@link EntityEventAudience}.
     * Clients subscribe to {@code /user/queue/entities}.
     */
    public static final String USER_DESTINATION = "/queue/entities";

    private final SimpMessagingTemplate messagingTemplate;
    private final EntityEventAudience audience;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCommit(EntityChangedEvent event) {
        if (event == null || event.entity() == null) return;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("entity", event.entity());
        if (event.id() != null) {
            payload.put("id", event.id().toString());
        }
        payload.put("action", event.action());
        if (event.projectId() != null) {
            payload.put("projectId", event.projectId().toString());
        }
        for (UUID recipient : audience.recipients(event)) {
            messagingTemplate.convertAndSendToUser(recipient.toString(), USER_DESTINATION, payload);
        }
    }
}
