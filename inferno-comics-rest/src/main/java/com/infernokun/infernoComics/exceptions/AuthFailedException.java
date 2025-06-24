package com.infernokun.amaterasu.exceptions;

import org.springframework.security.core.AuthenticationException;

public class AuthFailedException extends AuthenticationException {
    public AuthFailedException(String msg, Throwable cause) {
        super(msg, cause);
    }

    public AuthFailedException(String msg) {
        super(msg);
    }
}