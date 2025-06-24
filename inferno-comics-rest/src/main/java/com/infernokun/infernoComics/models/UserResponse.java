package com.infernokun.amaterasu.models.entities.alt;

import com.infernokun.amaterasu.models.entities.Team;
import com.infernokun.amaterasu.models.enums.Role;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {
    private String id;
    private String username;
    private Role role;
    private Team team;
}
