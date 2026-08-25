CREATE TABLE ai_model_gate_state (
    gate_key VARCHAR(32) NOT NULL PRIMARY KEY,
    next_allowed_at DATETIME(6) NOT NULL
);

INSERT INTO ai_model_gate_state (gate_key, next_allowed_at)
VALUES ('model', CURRENT_TIMESTAMP(6));

CREATE TABLE ai_model_call_leases (
    lease_id CHAR(36) NOT NULL PRIMARY KEY,
    expires_at DATETIME(6) NOT NULL
);
CREATE INDEX idx_ai_model_call_leases_expiry
    ON ai_model_call_leases (expires_at);

CREATE TABLE ai_model_call_outcomes (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    breaker_failure BOOLEAN NOT NULL,
    occurred_at DATETIME(6) NOT NULL
);
CREATE INDEX idx_ai_model_call_outcomes_window
    ON ai_model_call_outcomes (occurred_at);
