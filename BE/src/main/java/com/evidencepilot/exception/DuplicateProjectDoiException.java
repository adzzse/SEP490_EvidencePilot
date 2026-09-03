package com.evidencepilot.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class DuplicateProjectDoiException extends ResponseStatusException {

    public DuplicateProjectDoiException(String doi) {
        super(HttpStatus.CONFLICT, "DOI already exists in this project: " + doi);
    }
}
