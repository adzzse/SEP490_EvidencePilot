package com.evidencepilot.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UserProfileUpdateRequest {

    @Size(max = 100)
    private String firstName;

    @Size(max = 100)
    private String lastName;

    /**
     * Optional new email address. If non-null and different from the user's
     * current email, the controller requires a valid {@code X-Email-Otp-Claim}
     * header (one-shot token previously issued by /api/users/email/otp/verify).
     */
    @Email(message = "Invalid email address format")
    @Size(max = 255, message = "Email must not exceed 255 characters")
    private String email;
}
