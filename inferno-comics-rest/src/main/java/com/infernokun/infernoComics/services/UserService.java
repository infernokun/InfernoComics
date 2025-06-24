package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.exceptions.ResourceNotFoundException;
import com.infernokun.infernoComics.models.User;
import com.infernokun.infernoComics.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserService implements UserDetailsService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public boolean existsByUsername(String username) {
        return this.userRepository.existsByUsername(username);
    }

    public void registerUser(User user) {
        String encodedPassword  = this.passwordEncoder.encode(user.getPassword());
        user.setPassword(encodedPassword);

        this.userRepository.save(user);
    }

    public List<User> findAllUsers() {
        return userRepository.findAll();
    }

    public User findUserByUsername(String username) {
        return userRepository.findByUsernameIgnoreCase(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    public User findUserById(String userId) {
        if (userId == null) {
            throw new IllegalArgumentException("User ID cannot be null");
        }
        return userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found!"));
    }

    public User createUser(User user) {
        return userRepository.save(user);
    }


    public List<User> createManyUsers(List<User> users) {
        return userRepository.saveAll(users);
    }

    public User deleteUser(String id) {
        User deletedUser = findUserById(id);
        userRepository.deleteById(deletedUser.getId());
        return deletedUser;
    }

    public User updateUser(String id, User user) {
        User existingUser = findUserById(id);

        existingUser.setUsername(user.getUsername());
        existingUser.setUpdatedAt(LocalDateTime.now());

        return userRepository.save(existingUser);

    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return userRepository.findByUsernameIgnoreCase(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    public boolean existsByUsernameIgnoreCase(String username) {
        return userRepository.existsByUsernameIgnoreCase(username);
    }

    public Optional<User> findByUsernameIgnoreCase(String username) {
        return userRepository.findByUsernameIgnoreCase(username);
    }
}
