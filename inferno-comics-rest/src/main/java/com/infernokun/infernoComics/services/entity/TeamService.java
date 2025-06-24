package com.infernokun.amaterasu.services.entity;

import com.infernokun.amaterasu.exceptions.ResourceNotFoundException;
import com.infernokun.amaterasu.models.entities.Team;
import com.infernokun.amaterasu.repositories.TeamRepository;
import com.infernokun.amaterasu.services.BaseService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class TeamService extends BaseService {
    private final TeamRepository teamRepository;

    @Autowired
    public TeamService(TeamRepository teamRepository) {
        this.teamRepository = teamRepository;
    }

    public List<Team> findAllTeams() {
        return teamRepository.findAll();
    }

    public Team findTeamById(String id) {
        return this.teamRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Team not found!"));
    }

    public Team createTeam(Team team) {
        return teamRepository.save(team);
    }

    public List<Team> createManyTeams(List<Team> teams) {
        return teamRepository.saveAll(teams);
    }

    public Team deleteTeam(String id) {
        Team deletedTeam = findTeamById(id);
        teamRepository.deleteById(deletedTeam.getId());
        return deletedTeam;
    }

    public Team updateTeam(Team team) {
        findTeamById(team.getId());
        team.setUpdatedAt(LocalDateTime.now());
        return teamRepository.save(team);
    }
}
