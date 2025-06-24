package com.infernokun.amaterasu.models;

import lombok.*;

@Data
@Getter
@Setter
@AllArgsConstructor
@ToString
public class RemoteCommandResponse {
    private final String output;
    private final String error;
    private final int exitCode;
    private final String both;

    public RemoteCommandResponse(String output, String error, int exitCode) {
        this.output = output;
        this.error = error;
        this.exitCode = exitCode;
        this.both = this.output + this.error;
    }

    public boolean isSuccess() {
        return exitCode == 0;
    }
}
