/* Admin and Principal Teacher Attendance module */
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const departments = ["BA","BSC","BCOM","BCA","BBA","MA","MSC","MCOM"];
  const api = async (url, options={}) => {
    const response = await fetch("/api"+url, {credentials:"include", headers:{"Content-Type":"application/json",...(options.headers||{})}, ...options});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  };
  const msg = (text, error=false) => {
    const box=$("messageBox"); if(!box) return; box.textContent=text; box.classList.remove("hidden","error"); if(error)box.classList.add("error");
  };
  const dateToday = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
  const show = id => { ["loginView","adminView","teacherView","principalView","studentView"].forEach(x=>$(x)?.classList.add("hidden")); $(id)?.classList.remove("hidden"); };
  async function openAdminDashboard(){
    show("adminView");
    if(window.currentUser) $("adminWelcome").textContent=`${window.currentUser.name || window.currentUser.username} | Super Admin`;
    await Promise.all([loadSummary(),loadUsers(),loadClasses(),loadStudents(),loadArchivedStudents(),loadAttendance()]);
  }
  async function loadSummary(){ const d=await api("/admin/summary"); $("adminStats").innerHTML=[["Teachers",d.teachers],["Principals",d.principals],["Students",d.students],["Classes",d.classes],["Attendance Days",d.attendanceDays]].map(x=>`<div class="stat-card"><h3>${x[1]}</h3><p>${x[0]}</p></div>`).join(""); }
  async function loadUsers(){ const d=await api("/admin/users"); const visible=d.users.filter(u=>u.role==="principal"||(u.role==="teacher"&&u.department&&u.name!=="College Teacher")); $("adminUsers").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Department</th><th>Status</th><th>Action</th></tr></thead><tbody>${visible.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${esc(u.department||"-")}</td><td>${u.isActive===false?"Inactive":"Active"}</td><td><button data-edit-user="${u._id}" class="admin-action-btn">Edit</button> ${u.isActive===false?`<button class="activate-btn admin-action-btn" data-activate-user="${u._id}">Activate</button>`:`<button class="deactivate-btn admin-action-btn" data-disable-user="${u._id}">Deactivate</button>`}</td></tr>`).join("")}</tbody></table></div>`;
    $("adminUsers").querySelectorAll("[data-edit-user]").forEach(b=>b.onclick=async()=>{const u=visible.find(x=>x._id===b.dataset.editUser); const name=prompt("Name",u.name); if(name===null)return; const username=prompt("Username",u.username); if(username===null)return; const department=u.role==="teacher"?prompt("Department: BA, BSC, BCOM, BCA, BBA, MA, MSC, MCOM",u.department):undefined; const password=prompt("New password (leave blank to keep current)"); const body={name,username}; if(department!==undefined)body.department=department.toUpperCase(); if(password)body.password=password; try{await api(`/admin/users/${u._id}`,{method:"PUT",body:JSON.stringify(body)});msg("Account updated");loadUsers();}catch(e){msg(e.message,true);}});
    $("adminUsers").querySelectorAll("[data-disable-user]").forEach(b=>b.onclick=async()=>{if(!confirm("Deactivate this account? Old records will remain."))return; await api(`/admin/users/${b.dataset.disableUser}`,{method:"DELETE"}); msg("Account deactivated"); loadUsers();});
    $("adminUsers").querySelectorAll("[data-activate-user]").forEach(b=>b.onclick=async()=>{if(!confirm("Activate this account?"))return;try{await api(`/admin/users/${b.dataset.activateUser}/activate`,{method:"PUT"});msg("Account activated");await loadUsers();await loadSummary();}catch(e){msg(e.message,true);}});
  }
  async function loadClasses(){const d=await api("/admin/classes"); $("adminClasses").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Department</th><th>Semester</th><th>Section</th><th>Subject</th><th>Teacher</th><th>Action</th></tr></thead><tbody>${d.classes.map(c=>`<tr><td>${esc(c.department)}</td><td>${esc(c.semester)}</td><td>${esc(c.section)}</td><td>${esc(c.subject)}</td><td>${esc(c.teacherId?.name||"-")}</td><td><button class="danger-btn" data-archive-class="${c._id}">Archive</button></td></tr>`).join("")}</tbody></table></div>`; $("adminClasses").querySelectorAll("[data-archive-class]").forEach(b=>b.onclick=async()=>{if(!confirm("Archive class? Attendance history will be preserved."))return; await api(`/admin/classes/${b.dataset.archiveClass}`,{method:"DELETE"}); loadClasses();loadSummary();});}
  async function loadStudents(){const d=await api("/admin/students"); $("adminStudents").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Roll</th><th>Department</th><th>Semester</th><th>Section</th><th>Action</th></tr></thead><tbody>${d.students.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.roll)}</td><td>${esc(s.classId?.department)}</td><td>${esc(s.classId?.semester)}</td><td>${esc(s.classId?.section)}</td><td><button data-edit-student="${s._id}">Edit</button> <button class="danger-btn" data-archive-student="${s._id}">Archive</button></td></tr>`).join("")}</tbody></table></div>`; $("adminStudents").querySelectorAll("[data-edit-student]").forEach(b=>b.onclick=async()=>{const st=d.students.find(x=>x._id===b.dataset.editStudent);const name=prompt("Student name",st.name);if(name===null)return;const roll=prompt("Roll number",st.roll);if(roll===null)return;await api(`/admin/students/${st._id}`,{method:"PUT",body:JSON.stringify({name,roll})});loadStudents();});$("adminStudents").querySelectorAll("[data-archive-student]").forEach(b=>b.onclick=async()=>{if(!confirm("Archive student? History will be preserved."))return;await api(`/admin/students/${b.dataset.archiveStudent}`,{method:"DELETE"});await Promise.all([loadStudents(),loadArchivedStudents(),loadSummary()]);});}
  async function loadArchivedStudents(){
    const box=$("adminArchivedStudents"); if(!box)return;
    try{
      const d=await api("/admin/archived-students");
      if(!d.students.length){box.innerHTML='<div class="archived-empty">No archived students found.</div>';return;}
      box.innerHTML=d.students.map(s=>{const c=s.classId||{};const cleanName=String(s.name||"").replace(/^\[INACTIVE\]\s*/,"");return `<div class="archived-student-card"><div class="archived-student-info"><strong>${esc(cleanName)}</strong><p>Roll: ${esc(s.roll)}</p><p>Department: ${esc(c.department||"-")} | Semester: ${esc(c.semester||"-")} | Section: ${esc(c.section||"-")}</p></div><button type="button" class="restore-btn" data-restore-student="${s._id}">Restore Student</button></div>`;}).join("");
      box.querySelectorAll("[data-restore-student]").forEach(b=>b.onclick=async()=>{if(!confirm("Restore this student? Previous attendance history will remain."))return;try{await api(`/admin/students/${b.dataset.restoreStudent}/restore`,{method:"POST"});msg("Student restored successfully");await Promise.all([loadArchivedStudents(),loadStudents(),loadSummary()]);}catch(e){msg(e.message,true);}});
    }catch(e){box.innerHTML=`<div class="archived-empty">${esc(e.message)}</div>`;}
  }
  async function loadAttendance(){const d=await api("/admin/attendance"); $("adminAttendance").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Department</th><th>Semester</th><th>Section</th><th>Subject</th><th>Marked By</th><th>Marks</th></tr></thead><tbody>${d.records.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.classId?.department)}</td><td>${esc(r.classId?.semester)}</td><td>${esc(r.classId?.section)}</td><td>${esc(r.classId?.subject)}</td><td>${esc(r.markedBy?.name)}</td><td>${r.marks?.length||0}</td></tr>`).join("")}</tbody></table></div>`;}
  document.addEventListener("DOMContentLoaded",()=>{
    const dep=$("adminTeacherDepartment"); if(dep)dep.innerHTML='<option value="">Select Department</option>'+departments.map(d=>`<option>${d}</option>`).join("");
    const login=$("adminLoginForm"); if(login)login.addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/auth/admin-login",{method:"POST",body:JSON.stringify({username:$("adminUsername").value.trim(),password:$("adminPassword").value})});window.currentUser=d.user;show("adminView");$("adminLoginForm").reset();await openAdminDashboard();msg("Admin login successful");}catch(e){msg(e.message,true);}});
    $("refreshArchivedStudentsBtn")?.addEventListener("click",loadArchivedStudents);
    const form=$("adminTeacherForm"); if(form)form.addEventListener("submit",async e=>{e.preventDefault();try{await api("/admin/teachers",{method:"POST",body:JSON.stringify({name:$("adminTeacherName").value,department:$("adminTeacherDepartment").value})});form.reset();msg("Teacher added successfully");loadUsers();loadSummary();}catch(e){msg(e.message,true);}});
    const d=$("principalTeacherDate"); if(d){d.value=dateToday();d.addEventListener("change",loadPrincipalTeachers);}
    $("loadTeacherAttendance")?.addEventListener("click",loadPrincipalTeachers);
    $("saveTeacherAttendance")?.addEventListener("click",savePrincipalTeacherAttendance);
    document.querySelectorAll(".logoutBtn").forEach(b=>b.addEventListener("click",()=>{setTimeout(()=>show("loginView"),50);}));
  });
  let principalTeachers=[];
  async function loadPrincipalTeachers(){try{
    principalTeachers=(await api("/principal/teachers")).teachers;
    const date=$("principalTeacherDate").value;
    const existing=(await api(`/principal/teacher-attendance/${date}`)).records;
    const map={}; existing.forEach(r=>{if(r.teacherId)map[r.teacherId._id]=r.status;});
    const rows=principalTeachers.map(t=>{const status=map[t._id]||"A";return `<tr><td><strong>${esc(t.name)}</strong></td><td>${esc(t.department)}</td><td><div class="attendance-toggle" data-teacher-toggle="${t._id}">
      <button type="button" class="status-choice present-choice ${status==="P"?"active":""}" data-status="P">✓ Present</button>
      <button type="button" class="status-choice absent-choice ${status==="A"?"active":""}" data-status="A">✕ Absent</button>
      <input type="hidden" data-teacher-status="${t._id}" value="${status}">
    </div></td><td><button type="button" class="history-btn" data-teacher-history="${t._id}">View History</button></td></tr>`;}).join("");
    $("principalTeacherAttendance").innerHTML=`<div class="teacher-attendance-summary"><span>Teachers: <b>${principalTeachers.length}</b></span><span class="present-count">Present: <b id="teacherPresentCount">${Object.values(map).filter(x=>x==="P").length}</b></span><span class="absent-count">Absent: <b id="teacherAbsentCount">${principalTeachers.length-Object.values(map).filter(x=>x==="P").length}</b></span></div><div class="table-wrap"><table><thead><tr><th>Teacher</th><th>Department</th><th>Attendance</th><th>History</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No department teachers added yet.</td></tr>'}</tbody></table></div>`;
    $("principalTeacherAttendance").querySelectorAll("[data-teacher-toggle] button").forEach(btn=>btn.onclick=()=>{const wrap=btn.closest("[data-teacher-toggle]");wrap.querySelector("input").value=btn.dataset.status;wrap.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===btn));updateTeacherCounts();});
    $("principalTeacherAttendance").querySelectorAll("[data-teacher-history]").forEach(btn=>btn.onclick=()=>loadTeacherHistory(btn.dataset.teacherHistory));
  }catch(e){msg(e.message,true);}}
  function updateTeacherCounts(){const values=[...document.querySelectorAll("[data-teacher-status]")].map(x=>x.value);const p=values.filter(x=>x==="P").length;const a=values.length-p;const pc=$("teacherPresentCount"),ac=$("teacherAbsentCount");if(pc)pc.textContent=p;if(ac)ac.textContent=a;}
  let activeHistoryTeacherId = null;
  let historyRequestToken = 0;
  async function loadTeacherHistory(id){
    const panel = $("principalTeacherHistory");
    if (!panel) return;
    activeHistoryTeacherId = id;
    const requestToken = ++historyRequestToken;
    // Clear the previously opened teacher's data immediately so it cannot remain visible.
    panel.innerHTML = '<div class="history-loading">Loading latest attendance history…</div>';
    panel.scrollIntoView({behavior:"smooth",block:"nearest"});
    try {
      const d = await api(`/principal/teachers/${encodeURIComponent(id)}/history?_=${Date.now()}`, {cache:"no-store", headers:{"Cache-Control":"no-cache"}});
      // Ignore an older response if the user selected another teacher while it was loading.
      if (requestToken !== historyRequestToken || activeHistoryTeacherId !== id) return;
      panel.innerHTML = `<div class="history-heading"><h3>${esc(d.teacher.name)} — ${esc(d.teacher.department)} Attendance History</h3><button type="button" class="history-refresh-btn" data-refresh-history="${esc(id)}">↻ Refresh History</button></div><div class="teacher-attendance-summary"><span>Total Days: <b>${d.total}</b></span><span class="present-count">Present: <b>${d.present}</b></span><span class="absent-count">Absent: <b>${d.absent}</b></span><span>Attendance: <b>${d.percent}%</b></span></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>${d.records.map(r=>`<tr><td>${esc(r.date)}</td><td><span class="history-status ${r.status==="P"?"is-present":"is-absent"}">${r.status==="P"?"Present":"Absent"}</span></td></tr>`).join("")||'<tr><td colspan="2">No attendance history found.</td></tr>'}</tbody></table></div>`;
      panel.querySelector("[data-refresh-history]")?.addEventListener("click", () => loadTeacherHistory(id));
    } catch(e) {
      if (requestToken !== historyRequestToken) return;
      panel.innerHTML = `<div class="history-error">${esc(e.message || "Could not load attendance history.")} <button type="button" class="history-refresh-btn" data-refresh-history="${esc(id)}">Try Again</button></div>`;
      panel.querySelector("[data-refresh-history]")?.addEventListener("click", () => loadTeacherHistory(id));
    }
  }
  async function savePrincipalTeacherAttendance(){try{const date=$("principalTeacherDate").value;const records=[...document.querySelectorAll("[data-teacher-status]")].map(x=>({teacherId:x.dataset.teacherStatus,status:x.value}));await api(`/principal/teacher-attendance/${date}`,{method:"PUT",body:JSON.stringify({records})});msg("Teacher attendance saved");await loadPrincipalTeachers();}catch(e){msg(e.message,true);}}
  window.openAdminDashboard=openAdminDashboard;
})();
