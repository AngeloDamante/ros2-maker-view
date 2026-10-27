#!/usr/bin/env python3
"""Demo ROS 2 node for trying ROS2 Maker View without a robot (views/demo.json).

Needs only a sourced ROS 2 installation (rclpy, std_msgs, std_srvs):

    source /opt/ros/humble/setup.bash
    python3 tools/demo_node.py
    python3 tools/demo_node.py --ros-args -r __node:=rmv_demo_b   # a second instance

Topics (under /<node name>, default /rmv_demo):
    sine        std_msgs/Float64   amplitude * sin(2 pi f t), 50 Hz
    battery     std_msgs/Float32   voltage slowly draining 12.6 -> 10.4 V and back
    state       std_msgs/Int32     cycles 0..3 every 2 s while `enabled`
    position    std_msgs/Float64   follows `setpoint` at most `max_rate` units/s
    setpoint    std_msgs/Float64   (subscribed) target for `position`
    enable      std_msgs/Bool      (subscribed) sets the `enabled` parameter
Service:
    reset       std_srvs/Trigger   position back to 0
Parameters:
    amplitude, frequency, enabled, label, gains, max_rate (must be > 0),
    serial_number (read-only)
"""

import math
import time

import rclpy
from rcl_interfaces.msg import ParameterDescriptor, SetParametersResult
from rclpy.node import Node
from rclpy.parameter import Parameter
from std_msgs.msg import Bool, Float32, Float64, Int32
from std_srvs.srv import Trigger


class DemoNode(Node):
    def __init__(self):
        super().__init__("rmv_demo")
        self.declare_parameter("amplitude", 1.0, ParameterDescriptor(description="Sine amplitude"))
        self.declare_parameter("frequency", 0.5, ParameterDescriptor(description="Sine frequency [Hz]"))
        self.declare_parameter("enabled", True)
        self.declare_parameter("label", "demo")
        self.declare_parameter("gains", [1.0, 0.1, 0.01])
        self.declare_parameter("max_rate", 20.0, ParameterDescriptor(description="Position slew rate [units/s], > 0"))
        self.declare_parameter("serial_number", 42, ParameterDescriptor(read_only=True))
        self.add_on_set_parameters_callback(self._on_params)

        self.pub_sine = self.create_publisher(Float64, "~/sine", 10)
        self.pub_battery = self.create_publisher(Float32, "~/battery", 10)
        self.pub_state = self.create_publisher(Int32, "~/state", 10)
        self.pub_position = self.create_publisher(Float64, "~/position", 10)
        self.create_subscription(Float64, "~/setpoint", self._on_setpoint, 10)
        self.create_subscription(Bool, "~/enable", self._on_enable, 10)
        self.create_service(Trigger, "~/reset", self._on_reset)

        self.t0 = time.monotonic()
        self.setpoint = 0.0
        self.position = 0.0
        self.state = 0
        self.last = time.monotonic()
        self.create_timer(0.02, self._fast)
        self.create_timer(0.5, self._slow)
        self.create_timer(2.0, self._step_state)
        self.get_logger().info(f"{self.get_name()} started")

    def _on_params(self, params):
        for p in params:
            if p.name == "max_rate" and p.value <= 0:
                return SetParametersResult(successful=False, reason="max_rate must be > 0")
        for p in params:
            self.get_logger().info(f"parameter {p.name} = {p.value}")
        return SetParametersResult(successful=True)

    def _on_setpoint(self, msg):
        self.setpoint = msg.data
        self.get_logger().info(f"setpoint {msg.data:.2f}")

    def _on_enable(self, msg):
        self.set_parameters([Parameter("enabled", value=msg.data)])
        self.get_logger().info(f"enabled = {msg.data}")

    def _on_reset(self, _req, res):
        self.position = 0.0
        self.setpoint = 0.0
        res.success = True
        res.message = "position reset to 0"
        self.get_logger().warn("reset requested")
        return res

    def _fast(self):
        now = time.monotonic()
        dt, self.last = now - self.last, now
        t = now - self.t0
        amp = self.get_parameter("amplitude").value
        freq = self.get_parameter("frequency").value
        self.pub_sine.publish(Float64(data=amp * math.sin(2 * math.pi * freq * t)))
        step = self.get_parameter("max_rate").value * dt
        self.position += max(-step, min(step, self.setpoint - self.position))
        self.pub_position.publish(Float64(data=self.position))

    def _slow(self):
        t = time.monotonic() - self.t0
        phase = (t % 120.0) / 60.0  # 0..2 over two minutes
        v = 12.6 - 2.2 * (phase if phase <= 1.0 else 2.0 - phase)
        self.pub_battery.publish(Float32(data=float(v)))

    def _step_state(self):
        if self.get_parameter("enabled").value:
            self.state = (self.state + 1) % 4
            if self.state == 3:
                self.get_logger().warn("state 3: fault simulated")
        self.pub_state.publish(Int32(data=self.state))


def main():
    rclpy.init()
    node = DemoNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
