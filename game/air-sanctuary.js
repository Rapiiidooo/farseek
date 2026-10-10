import * as THREE from "three";

export class AirSanctuary {
  constructor(archive, atlantis) {
    this.archive = archive;
    this.atlantis = atlantis;
    this.beacon = new THREE.Vector3(11, 26.3, -18);
    this.center = new THREE.Vector3(0, 29, -50);
    this.radii = new THREE.Vector3(20, 16, 65);
    this.airCenter = this.beacon.clone();
    this.airRadii = new THREE.Vector3(0.02, 0.02, 0.02);
    this.headPoint = new THREE.Vector3();
    this.active = false;
    this.progress = 0;
    // Water held apart from the sea, and currents in it: both read by the swimmer.
    this.pockets = [];
    this.currents = [];
    this.volume = {
      active: () => {
        const hero = this.archive.hero;
        return hero
          ? this.waterAt({
              x: hero.pos.x,
              y: hero.feet + 0.85,
              z: hero.pos.z,
            }) > 0.5
          : this.progress < 0.65;
      },
      minX: -24,
      maxX: 24,
      minZ: -110,
      maxZ: 4,
      bottom: 18,
      top: 47,
      current: (time, pos, feet) => {
        const flow = { x: Math.sin(time * 0.4) * 0.12, z: -0.08 };
        if (pos)
          for (const field of this.currents) {
            const v = field.at(pos.x, feet + 0.9, pos.z);
            flow.x += v.x;
            flow.z += v.z;
          }
        return flow;
      },
    };
  }

  async build() {
    const a = this.archive;
    a.slab(10, -18, 6, 6, 25);
    for (let i = 0; i < 6; i++)
      a.slab(5.25 + i * 0.6, -18, 0.65, 3.4, 28 - i * 0.5);
    this.console = await a.assets.make("shield_console", {
      keepHierarchy: true,
    });
    this.console.position.set(11, 25, -18);
    a.scene.add(this.console);
    a.world.addRound(11, -18, 0.7, 25, 26.4, "prop");
    const display = this.console.userData.parts.display;
    display.material = display.material.clone();
    this.materials = [display.material];
    this.uniforms = { uTime: { value: 0 }, uStrength: { value: 0 } };
    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        depthWrite: false,
        vertexShader: `varying vec3 vNormal; varying vec3 vEye; varying vec2 vUv;
          void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vEye=-p.xyz; vUv=uv; gl_Position=projectionMatrix*p; }`,
        // Rounding lets a unit dot product exceed 1; pow of the negative rest is NaN, which bloom spreads over the screen.
        // Dense grid lines and the sheet right at the lens fade out, so a crossing never fills the view.
        fragmentShader: `uniform float uTime; uniform float uStrength; varying vec3 vNormal; varying vec3 vEye; varying vec2 vUv;
          void main(){
            float rim=pow(clamp(1.0-abs(dot(normalize(vNormal),normalize(vEye))),0.0,1.0),2.1);
            vec2 cell=vUv*vec2(40.0,24.0);
            vec2 width=fwidth(cell);
            vec2 line=abs(fract(cell+0.5)-0.5)/max(width,vec2(0.001));
            float grid=(1.0-smoothstep(0.3,1.1,min(line.x,line.y)))*(1.0-smoothstep(0.25,0.6,max(width.x,width.y)));
            float wave=pow(max(0.0,0.5+0.5*sin(vUv.y*30.0-uTime*0.7)),12.0);
            float outer=0.1+rim*0.4+grid*0.08+wave*0.055;
            float inner=0.055+rim*0.26+grid*0.045+wave*0.035;
            float alpha=(gl_FrontFacing?outer:inner)*uStrength*smoothstep(0.5,3.5,length(vEye));
            gl_FragColor=vec4(mix(vec3(0.08,0.55,0.67),vec3(0.3,0.95,0.86),rim+grid*0.2),alpha);
          }`,
      }),
    );
    this.shell.name = "airSanctuaryBoundary";
    this.shell.renderOrder = 2;
    a.scene.add(this.shell);
    this.light = new THREE.PointLight(0xffdfa5, 0, 38, 1.2);
    this.light.position.set(0, 35, -20);
    a.scene.add(this.light);
    this.apply();
  }

  near(hero) {
    return (
      Math.hypot(
        hero.pos.x - this.beacon.x,
        hero.feet + 0.9 - this.beacon.y,
        hero.pos.z - this.beacon.z,
      ) < 2.4
    );
  }

  waterAt(point) {
    for (const pocket of this.pockets) if (pocket.contains(point)) return 1;
    if (!this.active || this.progress <= 0) return 1;
    const radius = Math.hypot(
      (point.x - this.airCenter.x) / this.airRadii.x,
      (point.y - this.airCenter.y) / this.airRadii.y,
      (point.z - this.airCenter.z) / this.airRadii.z,
    );
    return THREE.MathUtils.smoothstep(radius, 0.96, 1.02);
  }

  headWater(hero) {
    if (this.archive.headJoint)
      this.archive.headJoint.getWorldPosition(this.headPoint);
    else this.headPoint.set(hero.pos.x, hero.feet + 1.5, hero.pos.z);
    return this.waterAt(this.headPoint);
  }

  activate(hero) {
    if (this.active || !this.near(hero)) return false;
    this.active = true;
    this.archive.services.sound?.play("ignite");
    this.archive.services.hud?.clearHint?.();
    this.archive.services.hud?.subtitle(
      "The shield is pushing the sea back. Air, at last.",
      4,
    );
    return true;
  }

  update(dt, hero) {
    this.uniforms.uTime.value += dt;
    if (this.active) this.progress = Math.min(1, this.progress + dt / 3);
    this.apply();
    if (this.volume.active())
      hero.prompt = this.near(hero) && !this.active ? "shield" : "swim";
  }

  apply() {
    const p = THREE.MathUtils.smoothstep(this.progress, 0, 1);
    this.airCenter.lerpVectors(this.beacon, this.center, p);
    this.airRadii.copy(this.radii).multiplyScalar(p).addScalar(0.02);
    this.shell.position.copy(this.airCenter);
    this.shell.scale.copy(this.airRadii);
    this.uniforms.uStrength.value = this.active ? 1 : 0;
    this.light.intensity = p * 65;
    for (const m of this.materials)
      m.emissiveIntensity = this.active
        ? 3
        : 1.4 + Math.sin(this.uniforms.uTime.value * 2) * 0.35;
    if (this.atlantis) {
      this.atlantis.u.uAir.value = this.active ? 1 : 0;
      this.atlantis.u.uAirCenter.value.copy(this.airCenter);
      this.atlantis.u.uAirRadii.value.copy(this.airRadii);
    }
  }

  reset(solved = false) {
    this.active = solved;
    this.progress = solved ? 1 : 0;
    this.apply();
  }

  telemetry(hero) {
    return {
      active: this.active,
      progress: this.progress,
      ready: this.progress === 1,
      beacon: this.beacon.toArray(),
      console: "airShieldConsole",
      boundary: {
        center: this.airCenter.toArray(),
        radii: this.airRadii.toArray(),
      },
      water: hero ? this.headWater(hero) : 1,
      near: !!hero && this.near(hero),
    };
  }
}
