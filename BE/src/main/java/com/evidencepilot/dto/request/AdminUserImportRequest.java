package com.evidencepilot.dto.request;

import java.util.List;

public record AdminUserImportRequest(String role, List<UserItem> users, boolean devBypass) {

    public AdminUserImportRequest(String role, List<UserItem> users) {
        this(role, users, false);
    }

    public record UserItem(String email, String firstName, String lastName, String studentCode) {
    }
}
