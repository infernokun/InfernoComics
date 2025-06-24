#!/usr/bin/python3

from enum import Flag
import requests
from datetime import datetime, timedelta
import json as JSON

import docker_challenge

url = "http://127.0.0.1:8080/amaterasu-rest/api"
admin_user = "amaterasu_admin"


def get_admin_user():
    res = requests.get(url + "/user/by?username=" + admin_user, verify=False)

    return res.json()["data"]


def get_docker_room():
    res = requests.get(url + "/room/by?name=Docker%20Room", verify=False)

    return res.json()["data"]


def room_docker():
    user = get_admin_user()

    room_endpoint = url + "/room"

    headers = {"Content-Type": "application/json", "Accept": "application/json"}

    data = {"name": "Docker Room", "creator": {"id": user["id"]}}

    res = requests.post(room_endpoint, headers=headers, json=data, verify=False)

    return res.json()


def docker_challenges():
    challenge_endpoint = url + "/ctf-entity"

    docker_room = get_docker_room()
    admin_user = get_admin_user()

    headers = {"Content-Type": "application/json", "Accept": "application/json"}

    challenges = docker_challenge.get_challenges(docker_room, admin_user)

    # Post each challenge
    for challenge in challenges:
        res = requests.post(
            challenge_endpoint, headers=headers, json=challenge, verify=False
        )
        print(res.json())
        if res.status_code == 200:
            print("Challenge created successfully.")


def main():
    # room_docker()
    docker_challenges()

    '''x = docker_challenge.get_challenges({'id': 'test'}, {'username': 'test'})
    with open("docker_challenges.json", "w") as f:
        f.write(JSON.dumps(x, indent=4))'''

if __name__ == "__main__":
    main()
