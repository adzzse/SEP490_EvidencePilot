package com.evidencepilot.event;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EntityChangedBroadcasterTest {

    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private EntityEventAudience audience;

    @InjectMocks private EntityChangedBroadcaster broadcaster;

    @Test
    void nullEvent_sendsNothing() {
        broadcaster.onCommit(null);

        verifyNoInteractions(messagingTemplate, audience);
    }

    @Test
    void fansOutPerRecipientOnUserQueueOnly() {
        UUID projectId = UUID.randomUUID();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        var event = new EntityChangedEvent("PROJECT", projectId, "STATUS_CHANGED", null);
        when(audience.recipients(event)).thenReturn(Set.of(first, second));

        broadcaster.onCommit(event);

        verify(messagingTemplate).convertAndSendToUser(eq(first.toString()), eq("/queue/entities"), any(Map.class));
        verify(messagingTemplate).convertAndSendToUser(eq(second.toString()), eq("/queue/entities"), any(Map.class));
        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
        verify(messagingTemplate, never()).convertAndSendToUser(anyString(),
                argThat(destination -> destination != null && destination.startsWith("/topic/")), any());
    }

    @Test
    void emptyRecipients_sendsNothing() {
        var event = new EntityChangedEvent("USER", null, "STATUS_CHANGED", null);
        when(audience.recipients(event)).thenReturn(Set.of());

        broadcaster.onCommit(event);

        verifyNoInteractions(messagingTemplate);
    }
}
