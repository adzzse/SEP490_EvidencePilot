package com.evidencepilot.event;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class EntityChangedBroadcaster {

    public static final String DESTINATION = "/topic/entities";

    private final SimpMessagingTemplate messagingTemplate;

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
        messagingTemplate.convertAndSend(DESTINATION, payload);
    }
}
