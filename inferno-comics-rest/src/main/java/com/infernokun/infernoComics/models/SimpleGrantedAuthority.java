package com.infernokun.amaterasu.models.auth;

import lombok.EqualsAndHashCode;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.util.Assert;

import java.io.Serial;

@EqualsAndHashCode
public final class SimpleGrantedAuthority implements GrantedAuthority {
    @Serial
    private static final long serialVersionUID = 620L;
    private final String role;

    public SimpleGrantedAuthority(String role) {
        Assert.hasText(role,"A granted authority textual representation is required");
        this.role = role;
    }

    @Override
    public String getAuthority() {
        return this.role;
    }
}
