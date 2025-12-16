package com.infernokun.infernoComics;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableCaching
@EnableScheduling
@SpringBootApplication
@EnableAspectJAutoProxy
public class InfernoComicsRestApplication implements CommandLineRunner {

    static void main(String[] args) {
		SpringApplication.run(InfernoComicsRestApplication.class, args);
	}

	@Override
	public void run(String... args) { }
}
