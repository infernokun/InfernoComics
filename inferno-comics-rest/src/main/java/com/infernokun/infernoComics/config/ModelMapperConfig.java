package com.infernokun.infernoComics.config;

import org.modelmapper.ModelMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ModelMapperConfig {

    @Bean
    public ModelMapper modelMapper() {

        /*mapper.createTypeMap(FlagRequest.class, Flag.class)
                .addMappings(mapping -> {
                    mapping.skip(Flag::setId);
                    mapping.skip(Flag::setCtfEntity); // We'll set this manually
                });*/
        return new ModelMapper();
    }
}
