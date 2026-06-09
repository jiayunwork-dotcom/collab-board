package com.collabboard;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CollabBoardApplication {
    public static void main(String[] args) {
        SpringApplication.run(CollabBoardApplication.class, args);
    }
}
