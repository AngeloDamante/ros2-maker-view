#!/usr/bin/env bash
PORT="${1:-8765}"

ros2 launch foxglove_bridge foxglove_bridge_launch.xml port:=${PORT}
