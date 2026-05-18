import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';

export class StateManager {
  private io: Server | null = null;
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  setIo(io: Server) {
    this.io = io;
  }

  async getStates() {
    const devices = await this.prisma.device.findMany();
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 'GLOBAL' } });
    const alerts = await this.prisma.alert.findMany({ where: { acknowledged: false } });
    const profiles = await this.prisma.accessProfile.findMany();

    const energy = {
      grid: config?.powerSource === 'MAINS' ? 'Connected' : 'Failing',
      source: config?.powerSource || 'MAINS',
      voltage: config?.powerSource === 'MAINS' ? 228 : config?.powerSource === 'INVERTER' ? 220 : 0,
      status: config?.powerSource === 'MAINS' ? 'Stable' : 'Battery Optimal',
      battery: 88,
      solar: 1.2,
      forecast: 'Overcast Tomorrow',
    };

    return {
      devices,
      mode: config?.mode,
      location: 'Home',
      updateAvailable: false,
      subscriptionActive: true,
      powerSource: config?.powerSource,
      duressActive: config?.mode === 'DURESS_ACTIVE',
      assistantName: 'Ujo',
      alerts,
      energy,
      accessProfiles: profiles,
    };
  }

  async findPhone() {
    const isPhoneOnline = Math.random() > 0.3;

    if (isPhoneOnline) {
      const triangulation = [
        { room: 'Living Room', rssi: -65, status: 'Weak' },
        { room: 'Kitchen', rssi: -42, status: 'Strong' },
        { room: 'Bedroom', rssi: -71, status: 'Very Weak' },
      ];

      const strongest = triangulation.sort((a, b) => b.rssi - a.rssi)[0];

      await this.triggerAnomaly(
        'Spatial Locator Success',
        `Phone heartbeat detected. Strongest signal in ${strongest.room} (-42dBm). Sonar activated.`,
        'info',
        'system'
      );

      if (this.io) {
        this.io.emit('phone_sonar_active', { room: strongest.room });
      }
      return { success: true, room: strongest.room, battery: 88, status: 'ONLINE' };
    }

    const isDeadInside = Math.random() > 0.5;
    const response = isDeadInside
      ? {
          success: true,
          status: 'DEAD_INSIDE',
          lastKnownRoom: 'Living Room',
          lastBattery: 1,
          timestamp: '16:12',
          message:
            'Phone battery dropped to 1% at 4:12 PM. Its last known location was near the Living Room couch.',
        }
      : {
          success: true,
          status: 'OFF_SITE',
          lastGeofenceExit: '08:45',
          message:
            'Phone is not within the home network. It was last registered leaving the geofence at 8:45 AM.',
        };

    await this.triggerAnomaly('Spatial Locator Fallback', response.message, 'medium', 'system');
    return response;
  }

  async lazarusReboot(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return { success: false, message: 'Device not found' };

    await this.prisma.device.update({ where: { id: deviceId }, data: { status: 'REBOOTING' } });
    await this.broadcastUpdate();

    setTimeout(async () => {
      await this.prisma.device.update({ where: { id: deviceId }, data: { status: 'ONLINE' } });
      await this.triggerAnomaly(
        'Lazarus Self-Heal',
        `Device ${device.name} was unresponsive. Autonomous power-cycle (3s) successful. Re-synced to BLE Mesh.`,
        'low',
        'system'
      );
      await this.broadcastUpdate();
    }, 3000);

    return { success: true };
  }

  async broadcastUpdate() {
    if (this.io) {
      const data = await this.getStates();
      this.io.emit('state_update', data);
    }
  }

  async updateDevice(id: string, state: string) {
    await this.prisma.device.update({ where: { id }, data: { state } });
    await this.broadcastUpdate();
  }

  async setMode(mode: string) {
    await this.prisma.systemConfig.update({
      where: { id: 'GLOBAL' },
      data: { mode },
    });
    await this.broadcastUpdate();
  }

  async setPowerState(source: string) {
    const config = await this.prisma.systemConfig.update({
      where: { id: 'GLOBAL' },
      data: { powerSource: source },
    });

    if (source === 'INVERTER' && config.autoShedding) {
      await this.prisma.device.updateMany({
        where: { category: 'HEAVY', isSheddable: true },
        data: { state: 'OFF' },
      });
      await this.triggerAnomaly(
        'Load Shedding Active',
        'Grid power lost. Switched to Inverter. Non-essential heavy appliances shut down autonomously.',
        'medium',
        'ENERGY'
      );
    }
    await this.broadcastUpdate();
  }

  async logSecurityEvent(
    action: string,
    actor: string,
    status: 'SUCCESS' | 'FAILURE',
    metadata?: unknown
  ) {
    try {
      await this.prisma.securityAudit.create({
        data: {
          action,
          actor,
          status,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
      console.log(`[SECURITY AUDIT] ${action} by ${actor}: ${status}`);
    } catch (err) {
      console.error('Failed to log security event:', err);
    }
  }

  async unlockWithPin(pin: string) {
    const NORMAL_PIN = '1234';
    const DURESS_PIN = '9999';

    if (pin === NORMAL_PIN) {
      await this.updateDevice('lock_1', 'unlocked');
      await this.prisma.systemConfig.update({ where: { id: 'GLOBAL' }, data: { mode: 'STANDARD' } });
      await this.logSecurityEvent('PIN_ATTEMPT', 'Physical Keypad', 'SUCCESS', { type: 'NORMAL' });
      return { success: true, message: 'Welcome. Door unlocked.' };
    }

    if (pin === DURESS_PIN) {
      await this.updateDevice('lock_1', 'unlocked');
      await this.prisma.systemConfig.update({ where: { id: 'GLOBAL' }, data: { mode: 'DURESS_ACTIVE' } });
      await this.triggerAnomaly(
        'Silent Duress Alert',
        'Duress code entered. Security protocols initiated silently.',
        'CRITICAL',
        'SECURITY'
      );
      await this.logSecurityEvent('PIN_ATTEMPT', 'Physical Keypad', 'SUCCESS', { type: 'DURESS' });
      return { success: true, message: 'Welcome. Door unlocked.' };
    }

    await this.logSecurityEvent('PIN_ATTEMPT', 'Physical Keypad', 'FAILURE', { pin_entered: '****' });
    return { success: false, message: 'Invalid PIN' };
  }

  async triggerAnomaly(title: string, message: string, severity: string, type: string = 'anomaly') {
    const alert = await this.prisma.alert.create({
      data: {
        message: `${title}: ${message}`,
        severity,
        type,
      },
    });
    await this.broadcastUpdate();
    return alert.id;
  }

  async simulateMotion(room: string) {
    if (this.io) {
      this.io.emit('motion-detected', { room, timestamp: new Date() });
    }
    await this.logSecurityEvent('MOTION_DETECTED', 'Occupancy Sensor', 'SUCCESS', { room });
    console.log(`[MOTION] Simulated event in ${room}`);
  }

  async handleMotionAwayCheck() {
    const data = await this.getStates();
    if (data.location === 'Away') {
      const id = await this.triggerAnomaly(
        'Unexpected Motion',
        'Motion detected in Living Room while status is "Away". Intruders likely. Raise alarm?',
        'critical'
      );
      return { success: true, anomaly: true, id };
    }
    await this.updateDevice('light_1', 'on');
    return { success: true, anomaly: false, message: 'Welcome home. Light on.' };
  }

  async confirmAlert(id: string, _action: string) {
    await this.prisma.alert.update({
      where: { id },
      data: { acknowledged: true },
    });
    await this.broadcastUpdate();
    return { success: true, message: 'Alert acknowledged.' };
  }

  async checkStaffAccess(staffId: string) {
    const profile = await this.prisma.accessProfile.findUnique({ where: { id: staffId } });
    if (!profile) return { allowed: false, reason: 'No profile found' };

    const schedule = JSON.parse(profile.scheduleRaw || '{}');
    const { days = '', start_time = '00:00', end_time = '23:59' } = schedule;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      now.getDay()
    ];

    const isDayMatch = days.includes(currentDay);
    const isTimeMatch = currentTime >= start_time && currentTime <= end_time;

    if (isDayMatch && isTimeMatch) {
      await this.updateDevice('lock_1', 'unlocked');
      return { allowed: true, name: profile.name };
    }

    return {
      allowed: false,
      reason: `Access refused. Authorized for ${days} between ${start_time}-${end_time}.`,
    };
  }

  async setLocation(_location: string) {
    await this.broadcastUpdate();
  }

  async nlpParse(
    rawText: string,
    room?: string,
    securityFlags?: { voiceVerified: boolean; phonePresent: boolean }
  ) {
    const text = rawText.toLowerCase();
    const { voiceVerified = false, phonePresent = false } = securityFlags || {};

    const responses: string[] = [];
    let success = false;
    let vaultRequired = false;

    const commands = text.split(/ and | then |, /);

    for (const cmd of commands) {
      let cmdProcessed = false;

      let targetSuffix = '';
      if (room) {
        if (room.toLowerCase().includes('kitchen')) targetSuffix = 'Kitchen';
        if (room.toLowerCase().includes('living')) targetSuffix = 'Living Room';
        if (room.toLowerCase().includes('bedroom')) targetSuffix = 'Bedroom';
      }

      if (cmd.includes('light on') || cmd.includes('light off')) {
        const devices = await this.prisma.device.findMany({ where: { type: 'light' } });
        const target = devices.find((d) => d.name.includes(targetSuffix)) || devices[0];
        if (target) {
          const newState = cmd.includes('on') ? 'on' : 'off';
          await this.updateDevice(target.id, newState);
          responses.push(`${target.name} ${newState === 'on' ? 'activated' : 'deactivated'}`);
          cmdProcessed = true;
        }
      } else if (cmd.includes('ac on') || cmd.includes('ac off')) {
        const devices = await this.prisma.device.findMany({ where: { type: 'climate' } });
        const target = devices.find((d) => d.name.includes(targetSuffix)) || devices[0];
        if (target) {
          const newState = cmd.includes('on') ? 'on' : 'off';
          await this.updateDevice(target.id, newState);
          responses.push(`${target.name} ${newState === 'on' ? 'active' : 'idle'}`);
          cmdProcessed = true;
        }
      } else if (
        cmd.includes('unlock') ||
        cmd.includes('door open') ||
        cmd.includes('gate') ||
        cmd.includes('payment')
      ) {
        if (!phonePresent && !voiceVerified) {
          responses.push('Security protocol violation. Authentication required.');
          vaultRequired = true;
        } else if (!phonePresent && voiceVerified) {
          responses.push(
            'Security protocol requires phone verification for Vault features. Please use the physical keypad PIN override.'
          );
          vaultRequired = true;
        } else {
          if (cmd.includes('unlock') || cmd.includes('door')) {
            await this.updateDevice('lock_1', 'unlocked');
            responses.push('Door unlocked. Welcome home, Admin.');
          } else {
            responses.push('Action authorized. Dispatching request.');
          }
          cmdProcessed = true;
        }
      } else if (cmd.includes('energy') || cmd.includes('weather')) {
        responses.push('Tomorrow will be overcast. Run high-vampire loads today.');
        cmdProcessed = true;
      } else if (cmd.includes('diesel')) {
        responses.push('Diesel at 15%. Queued order to Ade Gas.');
        cmdProcessed = true;
      }

      if (cmdProcessed) success = true;
    }

    const response =
      responses.length > 0
        ? responses.join('. ') + '.'
        : 'I parsed your input but no specific triggers were activated.';

    return { success, response, intents: commands.length, vaultRequired };
  }
}
