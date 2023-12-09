#version 410
#define Epsilon 0.0000001

// uniform vec3 light_position;
uniform vec3 camera_position;
uniform sampler3D volume;
uniform float voxel_size;
uniform ivec3 grid_size;
uniform vec3 light_direction;

// world space
flat in float face_dot_v;

// model space
flat in vec3 model_cam_pos;
in vec3 fV;
in vec3 pos;

//out
out vec4 fColor;


float isInside(vec3 pos){
    // this works but did not notice performance difference
    return step(0.0, pos.x)*step(pos.x, 1.0) *
    step(0.0, pos.y)*step(pos.y, 1.0) *
    step(0.0, pos.z)*step(pos.z, 1.0);
    /*
        if (pos.x < 0.0 || pos.x > 1.0) return false;
        if (pos.y < 0.0 || pos.y > 1.0) return false;
        if (pos.z < 0.0 || pos.z > 1.0) return false;
        return true;
    */
}

// Work In Progress
vec3 findStartPos(){
    vec3 dir = normalize(fV);
    // x/0 is undefined behaviour
    //if(dir.x == 0.0) dir.x = 0.0000001;
    //if(dir.y == 0.0) dir.y = 0.0000001;
    //if(dir.z == 0.0) dir.z = 0.0000001;
    vec3 dir_inv = vec3(1.0)/dir;
    // move origin up to before intersecting the box
    vec3 origin = pos - 2.0 * dir;
    float t1 = (0.0 - origin.x) * dir_inv.x;
    float t2 = (1.0 - origin.x) * dir_inv.x;
    float t3 = (0.0 - origin.y) * dir_inv.y;
    float t4 = (1.0 - origin.y) * dir_inv.y;
    float t5 = (0.0 - origin.z) * dir_inv.z;
    float t6 = (1.0 - origin.z) * dir_inv.z;

    float tmin = max(max(min(t1, t2), min(t3, t4)), min(t5, t6));
    float tmax = min(min(max(t1, t2), max(t3, t4)), max(t5, t6));

    // we are sure that we hit the box otherwise we would not render here!
    // if tmax < 0, ray (line) is intersecting AABB, but whole AABB is behing us
    //if (tmax < 0) return { true};
    // if tmin > tmax, ray doesn't intersect AABB
    //if (tmin > tmax) return { false};


    // first intersection with cube
    vec3 intersect =  origin + dir * (tmin + 0.00001);
    // if camera is closer to the pos on the backface than the intersect, return the camera pos
    if (length(intersect-pos) > length(model_cam_pos - pos))
        return model_cam_pos;// 0.0 - 1.0
    return intersect;
}

struct hit_t {
    vec3 voxel;
    vec3 last_voxel;
    int material;
};

hit_t fixed_step(){
    vec3 V = normalize(fV) * voxel_size/15;// fixed step
    vec3 P = findStartPos();// P is in 0-1.0 space
    vec3 last_voxel = floor(P * voxel_size);
    for (int i = 0; i < 700; i++){
        if (isInside(P) < 0.5) discard;
        last_voxel += last_voxel - floor(P * voxel_size);
        int material = int(round(texture(volume, P).r*255));
        if (material != 0) return hit_t(P, last_voxel, material);
        P += V;
    }
    discard;
}


vec3 shade(hit_t hit){
    vec3 V=normalize(fV);
    vec3 N=normalize(hit.voxel-hit.last_voxel);
    vec3 L=normalize(light_direction);

    float diffuse_co=max(dot(L, N), 0);
    vec3 R=normalize(reflect(-L, N));
    float specular_co=pow(max(dot(R, V), 0.0), 0.5);
    //vec3 voxel_color=vec3(1, 0, 0);
    vec3 voxel_color=diffuse_co*vec3(0, 1, 0)+specular_co*vec3(0, 0, 1);//+specular_co*vec3(0, 0, 1);
    // use material color
    return voxel_color;
}

hit_t fvta_step(){
    //initialization
    //float sub_voxel_size=voxel_size/15;//to make it looks more smooth

    vec3 start = findStartPos();
    vec3 V=normalize(fV);
    vec3 voxel_index=floor((start)/voxel_size);//vec3(floor(start.x/voxel_size), floor(start.y/voxel_size), floor(start.z/voxel_size));//start from current point, this is the id of the current voxel

    vec3 d = V;
    vec3 step = sign(d);
    vec3 next_position = (voxel_index + step) * voxel_size;
    vec3 tMax = (next_position - start) / d;
    vec3 tDelta = voxel_size * (step / d);
    int max_steps = int(2.0/voxel_size);
    for(int i = 0; i < max_steps; i++){
        vec3 voxel_pos = (voxel_index) * voxel_size;
        int material = int(round(texture(volume, voxel_pos).r*255));
        if(material != 0){
            return hit_t(voxel_pos, vec3(0), material);
        }
        if(tMax.x < tMax.y){
            if(tMax.x < tMax.z){
                voxel_index.x += step.x;
                tMax.x += tDelta.x;
            }else{
                voxel_index.z += step.z;
                tMax.z += tDelta.z;
            }
        }
        else{
            if(tMax.y < tMax.z){
                voxel_index.y += step.y;
                tMax.y += tDelta.y;
            }else{
                voxel_index.z += step.z;
                tMax.z += tDelta.z;
            }
        }
        if(isInside(voxel_pos) < 0.5) discard;
    }


/*
    ivec3 step = ivec3(
    (V.x >= 0) ? 1:-1, // step longth of X. 1 for incremented and -1 for decremented.
    (V.y >= 0) ? 1:-1, // step longth of Y
    (V.z >= 0) ? 1:-1
    );// step longth of Z
*/

/*
    float next_voxel_x = (voxel_index.x+step.x)*voxel_size;// find the position of next voxel's boundary.
    float next_voxel_y = (voxel_index.y+step.y)*voxel_size;//
    float next_voxel_z = (voxel_index.z+step.z)*voxel_size;//

    float tMaxX = (d.x!=0) ? (next_voxel_x - start.x)/d.x:200000000;//find the t at which the ray crosses the first vertical voxel boundary
    float tMaxY = (d.y!=0) ? (next_voxel_y - start.y)/d.y:200000000;//and the mininum distance of x,y,z is the first voxel that the ray hit
    float tMaxZ = (d.z!=0) ? (next_voxel_z - start.z)/d.z:200000000;//

    float tDeltaX = (d.x!=0) ? voxel_size/d.x*step.x : 200000000;//length of step
    float tDeltaY = (d.y!=0) ? voxel_size/d.y*step.y : 200000000;
    float tDeltaZ = (d.z!=0) ? voxel_size/d.z*step.z : 200000000;
*/

    // the largest step is the step that was smallest "last" iteration
/*
    vec3 largest = vec3(
        float(tMaxX > tMaxY)*float(tMaxX > tMaxZ),
        float(tMaxY > tMaxZ)*float(tMaxY > tMaxX),
        float(tMaxZ > tMaxX)*float(tMaxZ > tMaxY)
    );
    vec3 last_voxel = (voxel_index + step * largest) * voxel_size;

    for (int i=0;i<300;i++)//need to add the end point
    {
        float isXSmallest = float(tMaxX < tMaxY)*float(tMaxX < tMaxZ);
        float isYSmallest = float(tMaxY < tMaxZ)*float(tMaxY < tMaxX);
        float isZSmallest = float(tMaxZ < tMaxX)*float(tMaxZ < tMaxY);
        if (isXSmallest == 0.0 && isYSmallest == 0.0 && isZSmallest == 0.0) isXSmallest = 1.0;

        voxel_index[0] += step.x * isXSmallest;
        voxel_index[1] += step.y * isYSmallest;
        voxel_index[2] += step.z * isZSmallest;

        tMaxX +=  isXSmallest * tDeltaX;
        tMaxY +=  isYSmallest * tDeltaY;
        tMaxZ +=  isZSmallest * tDeltaZ;

        vec3 voxel_position = voxel_index * voxel_size + Epsilon * V;

        if (isInside(voxel_position) < 0.5) discard;

        int material = int(round(texture(volume, voxel_position).r*255));//select a point which is a little bit inside the voxel
        if (material != 0)
        {
            return hit_t(
            voxel_position,
            last_voxel,
            material
            );
        }
        last_voxel = voxel_position;
    }
    discard;
*/
    discard;
}



void main()
{
    // custom front face culling to do it based on cam pos
    if (face_dot_v < 0.0) discard;

    //vec3 color = findStartPos();
    hit_t hit;
    //hit = fixed_step();
    hit = fvta_step();

    vec3 color = vec3(hit.voxel);
    //color = shade(hit);
    //color = normalize(hit.last_voxel - hit.voxel);

    fColor = vec4(color, 1);
}

