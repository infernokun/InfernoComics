package com.infernokun.infernoComics.config;

import com.infernokun.infernoComics.logger.InfernoComicsLogger;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Slf4j
@EnableWebMvc
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        log.info("Configuring CORS mappings for SSE support");

        registry.addMapping("/api/**")
                .allowedOrigins("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(false)
                .exposedHeaders("Content-Type", "Cache-Control", "Connection", "Transfer-Encoding") // Important for SSE
                .maxAge(3600);
    }

    @Bean
    public FilterRegistrationBean<InfernoComicsLogger> loggingFilter() {
        FilterRegistrationBean<InfernoComicsLogger> registrationBean = new FilterRegistrationBean<>();
        registrationBean.setFilter(new InfernoComicsLogger());
        registrationBean.addUrlPatterns("/*");
        return registrationBean;
    }
}
