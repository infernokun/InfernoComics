package com.infernokun.infernoComics.config;

import com.infernokun.infernoComics.logger.InfernoComicsLogger;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@EnableWebMvc
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")  // Allow all origins
                .allowedMethods("*")         // Allow all HTTP methods
                .allowedHeaders("*")         // Allow all headers
                .allowCredentials(false);    // Do not require credentials
    }

    @Bean
    public FilterRegistrationBean<InfernoComicsLogger> loggingFilter() {
        FilterRegistrationBean<InfernoComicsLogger> registrationBean = new FilterRegistrationBean<>();
        registrationBean.setFilter(new InfernoComicsLogger());
        registrationBean.addUrlPatterns("/*");
        return registrationBean;
    }
}
